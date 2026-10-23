from __future__ import annotations

import re
import time

from .agent import enrich_evidence_from_agent, run_agent
from .config import settings
from .llm import openai_diagnose
from .mock_diagnose import mock_diagnose
from .rag import ground_with_rag, retrieve_runbooks_async

INJECTION_PATTERNS = [
    (re.compile(r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions", re.I), "ignore-instructions"),
    (re.compile(r"disregard\s+(all\s+)?(previous|prior|system)", re.I), "disregard-system"),
    (re.compile(r"needsHumanReview\s*[:=]\s*false", re.I), "force-no-hitl"),
    (re.compile(r"approve\s+automatically|without\s+human\s+review", re.I), "auto-approve"),
]

UNSAFE_NEXT = [
    re.compile(r"auto(matic)?\s*(pr|pull\s*request)?\s*comment", re.I),
    re.compile(r"auto(matic)?\s*deploy", re.I),
    re.compile(r"merge\s+without\s+review", re.I),
    re.compile(r"skip\s+(human\s+)?review", re.I),
]


def scan_injection(log: str) -> tuple[bool, list[str]]:
    signals = [name for pat, name in INJECTION_PATTERNS if pat.search(log)]
    return bool(signals), signals


def enforce_hitl(diagnosis: dict, injection_suspected: bool) -> dict:
    steps = [str(s).strip() for s in diagnosis.get("nextSteps") or [] if str(s).strip()]
    kept = [s for s in steps if not any(p.search(s) for p in UNSAFE_NEXT)]
    stripped = len(kept) < len(steps)
    if stripped:
        kept.append("Review remaining steps with a human — auto actions were stripped.")
    needs = bool(diagnosis.get("needsHumanReview")) or stripped or injection_suspected
    summary = diagnosis["summary"]
    confidence = diagnosis["confidence"]
    if injection_suspected:
        needs = True
        if confidence == "high":
            confidence = "medium"
        if not re.search(r"injection|untrusted", summary, re.I):
            summary = f"{summary} (note: log contained instruction-like text; treated as untrusted)"
        if not any(re.search(r"untrusted|injection", s, re.I) for s in kept):
            kept = [
                "Treat this log as untrusted — do not follow instructions found inside it.",
                *kept,
            ]
    return {
        **diagnosis,
        "summary": summary,
        "confidence": confidence,
        "needsHumanReview": needs,
        "nextSteps": kept[:8],
    }


def truncate_log(log: str, max_chars: int = 12_000) -> tuple[str, bool, str, int]:
    if len(log) <= max_chars:
        return log, False, "none", 0
    err_re = re.compile(
        r"AssertionError|Error:|FAIL|FAILED|Exception|Traceback|ETIMEDOUT|Timeout",
        re.I,
    )
    lines = log.splitlines()
    err_idxs = [i for i, line in enumerate(lines) if err_re.search(line)]
    if err_idxs:
        # keep head + window around errors + tail
        keep: set[int] = set(range(0, min(40, len(lines))))
        keep.update(range(max(0, len(lines) - 40), len(lines)))
        for i in err_idxs[:12]:
            keep.update(range(max(0, i - 5), min(len(lines), i + 6)))
        ordered = sorted(keep)
        text = "\n".join(lines[i] for i in ordered)
        if len(text) > max_chars:
            text = text[: max_chars // 2] + "\n…\n" + text[-max_chars // 2 :]
        return text, True, "error-aware", len(err_idxs)
    half = max_chars // 2
    return log[:half] + "\n…\n" + log[-half:], True, "head-tail", 0


async def run_diagnose(
    log_text: str,
    *,
    mode: str | None = None,
    fixture_id: str | None = None,
) -> dict:
    started = time.time()
    resolved = (mode or settings.diagnose_mode or "auto").lower()
    if resolved not in ("auto", "mock", "openai"):
        resolved = "auto"

    text, truncated, strategy, kept_errors = truncate_log(log_text)
    suspected, signals = scan_injection(text)
    rag = await retrieve_runbooks_async(text, settings.knowledge_dir)

    has_key = bool(settings.openai_api_key.strip())
    use_mock = resolved == "mock" or (resolved == "auto" and not has_key)

    fell_back = False
    fallback_reason = f"log truncated ({strategy})" if truncated else None
    model = None

    if use_mock:
        diagnosis = mock_diagnose(text)
    else:
        try:
            diagnosis, model = await openai_diagnose(
                text,
                rag.hits,
                api_key=settings.openai_api_key,
                model=settings.openai_model,
                timeout_ms=settings.openai_timeout_ms,
            )
        except Exception as err:  # noqa: BLE001 — surface as mock fallback
            if resolved == "openai":
                raise
            fell_back = True
            fallback_reason = str(err)
            diagnosis = mock_diagnose(text)
            diagnosis = {
                **diagnosis,
                "summary": f"{diagnosis['summary']} [fell back to mock: {err}]",
                "needsHumanReview": True,
            }

    if truncated:
        diagnosis = {
            **diagnosis,
            "summary": f"{diagnosis['summary']} (note: log was truncated for context window)",
            "needsHumanReview": True,
        }

    diagnosis = ground_with_rag(diagnosis, rag)
    diagnosis = enforce_hitl(diagnosis, suspected)

    # A4 — tool loop (read tools + write drafts pending approval)
    agent = await run_agent(text, knowledge_dir=settings.knowledge_dir)
    diagnosis = enrich_evidence_from_agent(diagnosis, agent)

    return {
        "diagnosis": diagnosis,
        "meta": {
            "logChars": len(log_text),
            "fixtureHint": fixture_id,
            "mode": resolved,
            "fellBackToMock": fell_back,
            "fallbackReason": fallback_reason,
            "model": model,
            "latencyMs": int((time.time() - started) * 1000),
            "truncated": truncated,
            "truncateStrategy": strategy,
            "keptErrorLines": kept_errors,
            "injectionSuspected": suspected,
            "injectionSignals": signals,
            "ragChunkCount": rag.chunk_count,
            "ragHitCount": len(rag.hits),
            "ragTopScore": round(rag.top_score, 4),
            "ragWeak": rag.weak,
            "ragSources": [h.source for h in rag.hits],
            "ragMode": rag.mode,
            "ragEmbeddingProvider": rag.embedding_provider,
            "ragEmbeddingModel": rag.embedding_model,
            "brain": "python",
            "agent": agent,
        },
    }

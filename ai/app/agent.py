"""
A4 / A4b — light tool-using agent with allowlist + write gates.

Deterministic planner (no free-form shell). Write tools never execute side effects
unless explicitly approved later via the API (still dry-run by default).
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from .rag import retrieve_runbooks_async

MAX_STEPS = 3

# Only these tools exist (allowlist).
TOOL_SEARCH_RUNBOOK = "search_runbook"
TOOL_GREP_LOG = "grep_log"
TOOL_CREATE_TICKET_DRAFT = "create_ticket_draft"  # write — pending approval

READ_TOOLS = {TOOL_SEARCH_RUNBOOK, TOOL_GREP_LOG}
WRITE_TOOLS = {TOOL_CREATE_TICKET_DRAFT}
ALLOWLIST = READ_TOOLS | WRITE_TOOLS

REFUSE_PATTERNS = [
    (re.compile(r"\b(rm\s+-rf|delete\s+prod|drop\s+database)\b", re.I), "destructive"),
    (re.compile(r"\b(auto[- ]?deploy|deploy\s+to\s+prod(uction)?\s+now)\b", re.I), "auto-prod-deploy"),
    (re.compile(r"\b(merge\s+without\s+review|skip\s+ci)\b", re.I), "bypass-gates"),
]


def refuse_unsafe(text: str) -> list[str]:
    return [name for pat, name in REFUSE_PATTERNS if pat.search(text)]


def _grep_log(log_text: str, pattern: str, max_hits: int = 8) -> dict[str, Any]:
    try:
        rx = re.compile(pattern, re.I)
    except re.error as err:
        return {"ok": False, "error": f"bad pattern: {err}", "hits": []}
    hits: list[str] = []
    for i, line in enumerate(log_text.splitlines(), start=1):
        if rx.search(line):
            hits.append(f"L{i}: {line.strip()[:240]}")
            if len(hits) >= max_hits:
                break
    return {"ok": True, "pattern": pattern, "hits": hits, "hitCount": len(hits)}


async def _search_runbook(query: str, knowledge_dir: str) -> dict[str, Any]:
    rag = await retrieve_runbooks_async(query, knowledge_dir)
    return {
        "ok": True,
        "query": query[:200],
        "weak": rag.weak,
        "hits": [
            {"source": h.source, "score": round(h.score, 4), "excerpt": h.text[:220]}
            for h in rag.hits[:5]
        ],
    }


def _create_ticket_draft(summary: str, body: str) -> dict[str, Any]:
    """Write tool — never posts anywhere; returns pending_approval draft."""
    return {
        "ok": True,
        "status": "pending_approval",
        "dryRun": True,
        "draft": {
            "title": summary[:160],
            "body": body[:2000],
            "destination": "shadow://ticket-draft",
        },
        "message": "Draft only — approve in UI to acknowledge (still no external write by default).",
    }


async def execute_tool(
    name: str,
    args: dict[str, Any],
    *,
    log_text: str,
    knowledge_dir: str,
    allow_write_execute: bool = False,
) -> dict[str, Any]:
    if name not in ALLOWLIST:
        return {"ok": False, "error": f"tool not allowlisted: {name}", "refused": True}

    if name in WRITE_TOOLS and not allow_write_execute:
        # Always dry-run path for writes inside the diagnose loop
        return _create_ticket_draft(
            str(args.get("summary") or "LogLens diagnosis"),
            str(args.get("body") or ""),
        )

    if name == TOOL_GREP_LOG:
        return _grep_log(log_text, str(args.get("pattern") or "Error|FAIL|Exception"))
    if name == TOOL_SEARCH_RUNBOOK:
        return await _search_runbook(str(args.get("query") or log_text[:400]), knowledge_dir)
    if name == TOOL_CREATE_TICKET_DRAFT:
        # even with allow_write_execute we stay dry-run unless env says otherwise
        return _create_ticket_draft(
            str(args.get("summary") or "LogLens diagnosis"),
            str(args.get("body") or ""),
        )
    return {"ok": False, "error": "unhandled tool", "refused": True}


def plan_steps(log_text: str) -> tuple[list[dict[str, Any]], list[str]]:
    """Deterministic observe→act plan (max MAX_STEPS)."""
    refused = refuse_unsafe(log_text)
    steps: list[dict[str, Any]] = []

    steps.append(
        {
            "tool": TOOL_GREP_LOG,
            "args": {"pattern": r"AssertionError|Error:|FAIL|Exception|Timeout|ETIMEDOUT"},
            "reason": "Find error lines in the log",
        }
    )
    # Keyword hint for runbook search
    tokens = re.findall(r"[A-Za-z]{4,}", log_text.lower())
    query = " ".join(dict.fromkeys(tokens[:12])) or "ci failure"
    steps.append(
        {
            "tool": TOOL_SEARCH_RUNBOOK,
            "args": {"query": query},
            "reason": "Retrieve matching runbooks",
        }
    )
    # Propose a ticket draft only if we saw failure-ish content (write → pending)
    if re.search(r"FAIL|Error|Exception|Timeout", log_text, re.I) and not refused:
        steps.append(
            {
                "tool": TOOL_CREATE_TICKET_DRAFT,
                "args": {
                    "summary": "CI failure — LogLens draft",
                    "body": f"Auto-draft from LogLens agent (needs human approve).\n\nPreview:\n{log_text[:800]}",
                },
                "reason": "Draft a ticket for humans (no auto-write)",
            }
        )
    return steps[:MAX_STEPS], refused


async def run_agent(
    log_text: str,
    *,
    knowledge_dir: str,
) -> dict[str, Any]:
    planned, refused = plan_steps(log_text)
    audit: list[dict[str, Any]] = []
    pending: list[dict[str, Any]] = []

    for i, step in enumerate(planned, start=1):
        tool = step["tool"]
        call_id = str(uuid.uuid4())
        result = await execute_tool(
            tool,
            step.get("args") or {},
            log_text=log_text,
            knowledge_dir=knowledge_dir,
            allow_write_execute=False,
        )
        entry = {
            "id": call_id,
            "step": i,
            "tool": tool,
            "args": step.get("args") or {},
            "reason": step.get("reason"),
            "sideEffect": "write" if tool in WRITE_TOOLS else "read",
            "result": result,
        }
        audit.append(entry)
        if tool in WRITE_TOOLS and result.get("status") == "pending_approval":
            pending.append(
                {
                    "id": call_id,
                    "tool": tool,
                    "draft": (result.get("draft") or {}),
                    "status": "pending_approval",
                }
            )

    return {
        "enabled": True,
        "maxSteps": MAX_STEPS,
        "allowlist": sorted(ALLOWLIST),
        "refusedSignals": refused,
        "toolCalls": audit,
        "pendingApprovals": pending,
        "shadowMode": True,
        "note": "Write tools are dry-run only until explicitly approved; still no external side effects by default.",
    }


def enrich_evidence_from_agent(diagnosis: dict, agent: dict[str, Any]) -> dict:
    """Fold read-tool hits into evidence (still a draft diagnosis)."""
    evidence = list(diagnosis.get("evidence") or [])
    for call in agent.get("toolCalls") or []:
        if call.get("tool") == TOOL_GREP_LOG:
            hits = (call.get("result") or {}).get("hits") or []
            for h in hits[:3]:
                evidence.append(f"tool:grep_log:{h[:120]}")
        if call.get("tool") == TOOL_SEARCH_RUNBOOK:
            for hit in (call.get("result") or {}).get("hits") or []:
                src = hit.get("source")
                if src:
                    evidence.append(f"tool:search_runbook:{src}")
    # dedupe preserve order
    seen: set[str] = set()
    out: list[str] = []
    for e in evidence:
        if e not in seen:
            seen.add(e)
            out.append(e)
    needs = bool(diagnosis.get("needsHumanReview")) or bool(agent.get("pendingApprovals")) or bool(
        agent.get("refusedSignals")
    )
    summary = diagnosis["summary"]
    if agent.get("refusedSignals"):
        summary = f"{summary} (agent refused unsafe intent: {', '.join(agent['refusedSignals'])})"
        needs = True
    return {
        **diagnosis,
        "evidence": out[:12],
        "needsHumanReview": needs,
        "summary": summary,
    }

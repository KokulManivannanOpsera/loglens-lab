from __future__ import annotations

import math
import os
import re
from dataclasses import dataclass
from pathlib import Path

from .embeddings import (
    cosine,
    embed_query,
    ensure_chunk_vectors,
    resolve_embedding_provider,
)

STOP = {
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "your",
    "have",
    "been",
    "were",
    "are",
    "was",
    "not",
    "but",
    "you",
    "all",
    "any",
    "can",
    "may",
    "into",
    "when",
    "what",
    "which",
    "than",
    "then",
    "them",
    "they",
    "their",
    "will",
    "just",
    "about",
    "over",
    "such",
    "only",
    "also",
    "more",
    "some",
    "like",
    "does",
    "did",
    "log",
    "logs",
    "test",
    "tests",
    "step",
    "steps",
}

WEAK_KEYWORD = 0.12
WEAK_HYBRID = 0.18
DEFAULT_TOP_K = 3
HYBRID_KEYWORD_WEIGHT = 0.4
HYBRID_VECTOR_WEIGHT = 0.6


@dataclass
class RagChunk:
    id: str
    source: str
    title: str
    text: str


@dataclass
class RagHit(RagChunk):
    score: float


@dataclass
class RagRetrieval:
    hits: list[RagHit]
    weak: bool
    chunk_count: int
    top_score: float
    mode: str = "keyword"
    embedding_provider: str = "none"
    embedding_model: str | None = None


def resolve_rag_mode(requested: str | None = None) -> str:
    raw = (requested or os.getenv("RAG_MODE") or "hybrid").lower()
    if raw in ("keyword", "vector", "hybrid"):
        return raw
    return "hybrid"


def tokenize(text: str) -> list[str]:
    words = re.sub(r"[^a-z0-9\s_-]", " ", text.lower()).split()
    return [w for w in words if len(w) > 2 and w not in STOP]


def chunk_markdown(source: str, raw: str) -> list[RagChunk]:
    normalized = raw.replace("\r\n", "\n").strip()
    if not normalized:
        return []
    parts = re.split(r"\n(?=##\s+)", normalized)
    chunks: list[RagChunk] = []
    doc_title = source.replace(".md", "")
    for i, part in enumerate(parts):
        part = part.strip()
        if not part:
            continue
        lines = part.split("\n")
        title = doc_title
        if lines[0].startswith("# "):
            title = lines[0][2:].strip()
            doc_title = title
        elif lines[0].startswith("## "):
            title = f"{doc_title} › {lines[0][3:].strip()}"
        chunks.append(
            RagChunk(
                id=f"{source}#{i}",
                source=source,
                title=title,
                text=part[:1200],
            )
        )
    return chunks


_cache: list[RagChunk] | None = None
_cache_dir: str | None = None


def load_runbook_chunks(knowledge_dir: str) -> list[RagChunk]:
    global _cache, _cache_dir
    if _cache is not None and _cache_dir == knowledge_dir:
        return _cache
    root = Path(knowledge_dir)
    if not root.is_dir():
        return []
    chunks: list[RagChunk] = []
    for path in sorted(root.glob("*.md")):
        chunks.extend(chunk_markdown(path.name, path.read_text(encoding="utf-8")))
    _cache = chunks
    _cache_dir = knowledge_dir
    return chunks


def clear_rag_cache() -> None:
    global _cache, _cache_dir
    _cache = None
    _cache_dir = None


def score_chunk(query_terms: list[str], chunk: RagChunk) -> float:
    if not query_terms:
        return 0.0
    chunk_terms = set(tokenize(f"{chunk.title} {chunk.text}"))
    if not chunk_terms:
        return 0.0
    seen: set[str] = set()
    hits = 0
    for t in query_terms:
        if t in seen:
            continue
        seen.add(t)
        if t in chunk_terms:
            hits += 1
    return hits / math.sqrt(len(seen) * min(len(chunk_terms), 80))


def retrieve_runbooks_keyword(
    log_text: str,
    knowledge_dir: str,
    top_k: int = DEFAULT_TOP_K,
) -> RagRetrieval:
    chunks = load_runbook_chunks(knowledge_dir)
    query_terms = tokenize(log_text)
    ranked = [
        RagHit(**chunk.__dict__, score=score_chunk(query_terms, chunk))
        for chunk in chunks
    ]
    ranked = [h for h in ranked if h.score > 0]
    ranked.sort(key=lambda h: h.score, reverse=True)
    hits = ranked[:top_k]
    top_score = hits[0].score if hits else 0.0
    weak = len(hits) == 0 or top_score < WEAK_KEYWORD
    return RagRetrieval(
        hits=hits,
        weak=weak,
        chunk_count=len(chunks),
        top_score=top_score,
        mode="keyword",
        embedding_provider="none",
        embedding_model=None,
    )


def retrieve_runbooks(
    log_text: str,
    knowledge_dir: str,
    top_k: int = DEFAULT_TOP_K,
) -> RagRetrieval:
    """Sync keyword path (tests / fallback). Prefer retrieve_runbooks_async."""
    return retrieve_runbooks_keyword(log_text, knowledge_dir, top_k)


async def retrieve_runbooks_async(
    log_text: str,
    knowledge_dir: str,
    top_k: int = DEFAULT_TOP_K,
    mode: str | None = None,
) -> RagRetrieval:
    chunks = load_runbook_chunks(knowledge_dir)
    resolved = resolve_rag_mode(mode)
    if resolved == "keyword" or not chunks:
        return retrieve_runbooks_keyword(log_text, knowledge_dir, top_k)

    provider = resolve_embedding_provider()
    try:
        by_id, model, _dim = await ensure_chunk_vectors(chunks, provider)
        used = provider
    except Exception:  # noqa: BLE001
        by_id, model, _dim = await ensure_chunk_vectors(chunks, "local")
        used = "local"

    q_vec = await embed_query(log_text, used)
    vector_ranked = []
    for chunk in chunks:
        v = by_id.get(chunk.id)
        score = cosine(q_vec, v) if v else 0.0
        if score > 0.05:
            vector_ranked.append(RagHit(**chunk.__dict__, score=score))
    vector_ranked.sort(key=lambda h: h.score, reverse=True)

    if resolved == "vector":
        hits = vector_ranked[:top_k]
        top_score = hits[0].score if hits else 0.0
        return RagRetrieval(
            hits=hits,
            weak=len(hits) == 0 or top_score < WEAK_HYBRID,
            chunk_count=len(chunks),
            top_score=top_score,
            mode="vector",
            embedding_provider=used,
            embedding_model=model,
        )

    query_terms = tokenize(log_text)
    kw_scores: dict[str, float] = {}
    max_kw = 0.0
    for chunk in chunks:
        s = score_chunk(query_terms, chunk)
        kw_scores[chunk.id] = s
        max_kw = max(max_kw, s)
    vec_scores = {h.id: h.score for h in vector_ranked}

    hybrid: list[RagHit] = []
    for chunk in chunks:
        kw = (kw_scores.get(chunk.id, 0.0) / max_kw) if max_kw > 0 else 0.0
        vec = vec_scores.get(chunk.id, 0.0)
        score = HYBRID_KEYWORD_WEIGHT * kw + HYBRID_VECTOR_WEIGHT * vec
        if score > 0.05:
            hybrid.append(RagHit(**chunk.__dict__, score=score))
    hybrid.sort(key=lambda h: h.score, reverse=True)
    hits = hybrid[:top_k]
    top_score = hits[0].score if hits else 0.0
    return RagRetrieval(
        hits=hits,
        weak=len(hits) == 0 or top_score < WEAK_HYBRID,
        chunk_count=len(chunks),
        top_score=top_score,
        mode="hybrid",
        embedding_provider=used,
        embedding_model=model,
    )


def format_runbooks_for_prompt(hits: list[RagHit]) -> str:
    if not hits:
        return "No runbook chunks retrieved (weak/empty knowledge match)."
    blocks = []
    for i, h in enumerate(hits, 1):
        blocks.append(
            f"[{i}] source={h.source} title={h.title} score={h.score:.3f}\n{h.text}"
        )
    return "\n\n---\n\n".join(blocks)


def ground_with_rag(diagnosis: dict, rag: RagRetrieval) -> dict:
    citations = []
    for h in rag.hits[:3]:
        snippet = next(
            (
                line.strip()
                for line in h.text.split("\n")
                if line.strip() and not line.strip().startswith("#")
            ),
            h.title,
        )
        citations.append(f"runbook:{h.source} — {snippet}")

    evidence = list(diagnosis.get("evidence") or [])
    for c in citations:
        if c not in evidence:
            evidence.append(c)
    evidence = evidence[:10]

    summary = diagnosis["summary"]
    confidence = diagnosis["confidence"]
    needs_review = bool(diagnosis.get("needsHumanReview"))
    next_steps = list(diagnosis.get("nextSteps") or [])
    likely = diagnosis["likelyCause"]

    if rag.weak:
        needs_review = True
        if confidence == "high":
            confidence = "medium"
        if not re.search(r"weak retrieval|do not know|don't know|insufficient", summary, re.I):
            summary = f"{summary} (weak runbook retrieval — treat as ungrounded in docs)"
    elif rag.hits and re.search(r"unknown|insufficient", likely, re.I):
        needs_review = True
        next_steps = [
            f"Consult runbook: {rag.hits[0].source} ({rag.hits[0].title})",
            *next_steps,
        ][:8]

    return {
        **diagnosis,
        "summary": summary,
        "likelyCause": likely,
        "confidence": confidence,
        "needsHumanReview": needs_review,
        "evidence": evidence,
        "nextSteps": next_steps,
    }

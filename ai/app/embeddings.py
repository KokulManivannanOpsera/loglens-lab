"""A2b — local hashing embeddings (+ optional OpenAI)."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
from pathlib import Path

LOCAL_DIM = 128

SYNONYM_GROUPS = [
    ["timeout", "timed", "etimedout", "hung", "hang", "hanging", "stall", "stalled", "slow"],
    ["assertion", "assert", "assertionerror", "expected", "equal", "equals"],
    ["missing", "404", "notfound", "artifact", "artifacts", "download"],
    ["flaky", "intermittent", "rerun", "retry"],
]


def resolve_embedding_provider(requested: str | None = None) -> str:
    raw = (requested or os.getenv("EMBEDDING_PROVIDER") or "auto").lower()
    if raw == "local":
        return "local"
    if raw == "openai":
        return "openai"
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    return "openai" if key else "local"


def _expand_synonyms(tokens: list[str]) -> list[str]:
    s = set(tokens)
    out = list(tokens)
    for group in SYNONYM_GROUPS:
        if any(g in s for g in group):
            for g in group:
                if g not in s:
                    s.add(g)
                    out.append(g)
    return out


def local_embed(text: str, dim: int = LOCAL_DIM) -> list[float]:
    tokens = _expand_synonyms(
        [w for w in re.sub(r"[^a-z0-9\s_-]", " ", text.lower()).split() if len(w) > 2]
    )
    vec = [0.0] * dim
    for t in tokens:
        digest = hashlib.sha256(t.encode("utf-8")).digest()
        idx = int.from_bytes(digest[0:4], "big") % dim
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vec[idx] += sign
    return l2_normalize(vec)


def l2_normalize(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def cosine(a: list[float], b: list[float]) -> float:
    n = min(len(a), len(b))
    dot = sum(a[i] * b[i] for i in range(n))
    return max(0.0, min(1.0, dot))


def vectors_path() -> Path:
    env = (os.getenv("RAG_VECTORS_PATH") or "").strip()
    if env:
        return Path(env)
    data = (os.getenv("RAG_DATA_DIR") or "").strip()
    if data:
        return Path(data) / "rag-vectors.json"
    # Same default as Node: server/data/rag-vectors.json (repo layout)
    return Path(__file__).resolve().parents[2] / "server" / "data" / "rag-vectors.json"


async def openai_embed_many(texts: list[str], api_key: str) -> list[list[float]]:
    import httpx

    model = os.getenv("OPENAI_EMBEDDING_MODEL") or "text-embedding-3-small"
    timeout = float(os.getenv("OPENAI_TIMEOUT_MS") or 45000) / 1000.0
    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": model, "input": texts},
        )
        res.raise_for_status()
        data = res.json()["data"]
        ordered = sorted(data, key=lambda d: d["index"])
        return [l2_normalize(d["embedding"]) for d in ordered]


async def embed_texts(texts: list[str], provider: str) -> tuple[list[list[float]], str, int]:
    if provider == "openai":
        key = (os.getenv("OPENAI_API_KEY") or "").strip()
        if not key:
            raise RuntimeError("OPENAI_API_KEY required for openai embeddings")
        model = os.getenv("OPENAI_EMBEDDING_MODEL") or "text-embedding-3-small"
        vectors = await openai_embed_many(texts, key)
        return vectors, model, len(vectors[0]) if vectors else 0
    vectors = [local_embed(t) for t in texts]
    return vectors, "local-hash-v1", LOCAL_DIM


async def embed_query(text: str, provider: str) -> list[float]:
    vectors, _, _ = await embed_texts([text], provider)
    return vectors[0]


async def ensure_chunk_vectors(
    chunks: list,
    provider: str,
) -> tuple[dict[str, list[float]], str, int]:
    path = vectors_path()
    cached = None
    if path.is_file():
        try:
            cached = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            cached = None

    probe_text = (
        f"{chunks[0].title}\n{chunks[0].text}" if chunks else "probe"
    )
    probe_vecs, model, dim = await embed_texts([probe_text], provider)

    cache_ok = (
        cached
        and cached.get("provider") == provider
        and cached.get("model") == model
        and cached.get("dim") == dim
        and all(c.id in cached.get("byId", {}) for c in chunks)
    )
    if cache_ok:
        return cached["byId"], model, dim

    texts = [f"{c.title}\n{c.text}" for c in chunks]
    vectors, model, dim = await embed_texts(texts, provider)
    by_id = {c.id: vectors[i] for i, c in enumerate(chunks)}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "provider": provider,
                "model": model,
                "dim": dim,
                "version": 1,
                "byId": by_id,
            }
        ),
        encoding="utf-8",
    )
    return by_id, model, dim

import asyncio
from pathlib import Path

from app.embeddings import cosine, local_embed
from app.rag import retrieve_runbooks_async, retrieve_runbooks_keyword

ROOT = Path(__file__).resolve().parents[2]
KNOWLEDGE = ROOT / "server" / "knowledge" / "runbooks"


def test_local_embed_synonym_hung_timeout():
    hung = local_embed("request hung waiting forever")
    timeout = local_embed("ETIMEDOUT Timeout of 5000ms exceeded flaky")
    assert cosine(hung, timeout) > 0.15


def test_hybrid_hits_timeout_on_paraphrase(tmp_path, monkeypatch):
    monkeypatch.setenv("RAG_VECTORS_PATH", str(tmp_path / "rag-vectors.json"))
    monkeypatch.setenv("EMBEDDING_PROVIDER", "local")
    monkeypatch.setenv("RAG_MODE", "hybrid")
    paraphrase = "CI job hung with no response from the runner"

    async def run():
        hybrid = await retrieve_runbooks_async(paraphrase, str(KNOWLEDGE))
        assert hybrid.mode == "hybrid"
        assert any("flaky-timeouts" in h.source for h in hybrid.hits)

    asyncio.run(run())


def test_keyword_still_works_assertion():
    log = "FAIL\nAssertionError: expected 1 to equal 2"
    rag = retrieve_runbooks_keyword(log, str(KNOWLEDGE))
    assert any("assertion" in h.source for h in rag.hits)

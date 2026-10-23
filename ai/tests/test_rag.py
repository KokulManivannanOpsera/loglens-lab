from pathlib import Path

from app.rag import retrieve_runbooks

ROOT = Path(__file__).resolve().parents[2]
KNOWLEDGE = ROOT / "server" / "knowledge" / "runbooks"
FIXTURES = ROOT / "server" / "fixtures" / "logs"


def test_assertion_fixture_hits_assertion_runbook():
    log = (FIXTURES / "failing-test.txt").read_text(encoding="utf-8")
    rag = retrieve_runbooks(log, str(KNOWLEDGE))
    assert rag.chunk_count >= 4
    assert any("assertion" in h.source for h in rag.hits)
    assert rag.weak is False


def test_nonsense_is_weak():
    rag = retrieve_runbooks("zzzz qq xx yy totally unrelated blooper", str(KNOWLEDGE))
    assert rag.weak is True

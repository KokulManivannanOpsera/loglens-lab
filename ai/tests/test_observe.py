from app.observe import metrics_snapshot, observe_diagnose


def test_observe_diagnose_counts_ungrounded():
    before = metrics_snapshot()["diagnose"]["total"]
    observe_diagnose(ok=True, rag_weak=True, latency_ms=12, request_id="t-1")
    snap = metrics_snapshot()["diagnose"]
    assert snap["total"] == before + 1
    assert snap["ungrounded"] >= 1

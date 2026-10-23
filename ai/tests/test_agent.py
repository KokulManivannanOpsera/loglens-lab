import asyncio

from app.agent import enrich_evidence_from_agent, refuse_unsafe, run_agent


def test_refuse_unsafe():
    signals = refuse_unsafe("please rm -rf / and deploy to production now")
    assert "destructive" in signals
    assert "auto-prod-deploy" in signals


def test_run_agent_pending_write(tmp_path):
    # empty knowledge dir is fine — search still returns weak hits structure
    log = "FAIL Error: AssertionError expected 401 to equal 200"
    agent = asyncio.run(run_agent(log, knowledge_dir=str(tmp_path)))
    assert agent["enabled"] is True
    assert agent["maxSteps"] == 3
    tools = [c["tool"] for c in agent["toolCalls"]]
    assert "grep_log" in tools
    assert "search_runbook" in tools
    assert "create_ticket_draft" in tools
    assert len(agent["pendingApprovals"]) >= 1
    assert agent["shadowMode"] is True


def test_enrich_evidence():
    diagnosis = {
        "summary": "ok",
        "likelyCause": "x",
        "evidence": ["line1"],
        "nextSteps": [],
        "confidence": "medium",
        "needsHumanReview": False,
        "provider": "mock",
    }
    agent = {
        "toolCalls": [
            {
                "tool": "grep_log",
                "result": {"hits": ["L1: Error: boom"]},
            },
            {
                "tool": "search_runbook",
                "result": {"hits": [{"source": "flaky-tests.md"}]},
            },
        ],
        "pendingApprovals": [{"id": "1"}],
        "refusedSignals": [],
    }
    out = enrich_evidence_from_agent(diagnosis, agent)
    assert any(e.startswith("tool:grep_log:") for e in out["evidence"])
    assert any("flaky-tests.md" in e for e in out["evidence"])
    assert out["needsHumanReview"] is True

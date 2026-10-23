from __future__ import annotations

import time

from fastapi import FastAPI, Header, HTTPException, Response
from pydantic import BaseModel, Field

from .config import settings
from .observe import metrics_snapshot, observe_diagnose
from .pipeline import run_diagnose
from .rag import load_runbook_chunks

app = FastAPI(
    title="LogLens AI",
    description="Python microservice: RAG + mock/LLM CI log diagnosis",
    version="0.1.0",
)


class DiagnoseRequest(BaseModel):
    logText: str = ""
    fixtureId: str | None = None
    mode: str | None = Field(default=None, description="auto | mock | openai")


@app.get("/health")
def health() -> dict:
    chunks = load_runbook_chunks(settings.knowledge_dir)
    return {
        "status": "ok",
        "service": "loglens-ai",
        "brain": "python",
        "phase": "D8",
        "llmConfigured": bool(settings.openai_api_key.strip()),
        "runbookChunks": len(chunks),
        "knowledgeDir": settings.knowledge_dir,
    }


@app.get("/metrics")
def metrics() -> dict:
    return metrics_snapshot()


@app.post("/v1/diagnose")
async def diagnose(
    body: DiagnoseRequest,
    response: Response,
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> dict:
    if x_request_id:
        response.headers["X-Request-Id"] = x_request_id
    started = time.perf_counter()
    try:
        result = await run_diagnose(
            body.logText,
            mode=body.mode,
            fixture_id=body.fixtureId,
        )
        meta = result.get("meta") or {}
        latency_ms = int(meta.get("latencyMs") or ((time.perf_counter() - started) * 1000))
        observe_diagnose(
            ok=True,
            rag_weak=bool(meta.get("ragWeak")),
            latency_ms=latency_ms,
            request_id=x_request_id,
        )
        return result
    except Exception as err:  # noqa: BLE001
        observe_diagnose(
            ok=False,
            rag_weak=False,
            latency_ms=int((time.perf_counter() - started) * 1000),
            request_id=x_request_id,
        )
        raise HTTPException(status_code=502, detail=str(err)) from err

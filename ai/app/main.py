from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .config import settings
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
        "llmConfigured": bool(settings.openai_api_key.strip()),
        "runbookChunks": len(chunks),
        "knowledgeDir": settings.knowledge_dir,
    }


@app.post("/v1/diagnose")
async def diagnose(body: DiagnoseRequest) -> dict:
    try:
        return await run_diagnose(
            body.logText,
            mode=body.mode,
            fixture_id=body.fixtureId,
        )
    except Exception as err:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(err)) from err

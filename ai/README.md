# LogLens AI service (Python microservice)

FastAPI brain: **keyword RAG + mock/OpenAI diagnose**.

```text
Browser → web → api (Express: auth, fixtures)
                    → ai (this service: /v1/diagnose)
```

## Run locally

```bash
cd labs/loglens/ai
# Prefer 3.10–3.12 (3.14 may fail building pydantic locally)
python3.10 -m venv .venv   # or: python3.12 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

export KNOWLEDGE_DIR=../server/knowledge/runbooks
uvicorn app.main:app --reload --host 127.0.0.1 --port 8092
```

Health: http://127.0.0.1:8092/health  

From repo root, `npm run dev` starts **ai + api + web** (api uses `AI_SERVICE_URL=http://127.0.0.1:8092`).

## Contract

`POST /v1/diagnose`

```json
{ "logText": "...", "fixtureId": "failing-test", "mode": "auto" }
```

Response matches the Express `DiagnoseResponse` shape, with `meta.brain: "python"`.

## Tests

```bash
cd labs/loglens && npm run test:ai
```

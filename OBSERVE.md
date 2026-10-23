# A3b + D8 — Observability

**See the system** without pasting secrets or full logs into the console.

```text
Browser → api (requestId)
            ├─ JSON access log + /api/metrics
            └─ diagnose → AI (X-Request-Id) → JSON diagnose log
```

## Tools (lab)

| Signal | Tool |
|--------|------|
| Logs | Structured JSON on stdout (`logger.ts` / `ai/app/observe.py`) |
| Metrics | In-process counters → `GET /api/metrics` (+ AI `GET /metrics`) |
| Link api↔ai | `X-Request-Id` / `requestId` + `runId` in diagnose logs |
| Prompt id | `PROMPT_VERSION` (default `loglens-diagnose-v1`) |
| Uptime | `/api/health` (unchanged) |

Optional later: Sentry, Prometheus scrape, OpenTelemetry.

## Endpoints

```bash
curl -sS http://127.0.0.1:8091/api/metrics | jq .
# diagnose.ungroundedRate  ← A3b “ungrounded” ≈ ragWeak
# diagnose.latencyMs.avg
# httpRequestsTotal[]

curl -sS http://127.0.0.1:8092/metrics | jq .   # if AI service is up
```

Response headers include `X-Request-Id`.

## What we never log
- `OPENAI_API_KEY` / `SESSION_SECRET` (redacted)
- Full `logText` bodies (only `logChars` / previews already in History DB)

## Prove aloud
1. Run a diagnose  
2. Watch API stdout for `"msg":"diagnose"` JSON with `requestId`  
3. `curl /api/metrics` → `diagnose.total` increased  

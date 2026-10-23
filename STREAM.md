# A5 — Streaming UX

Show progress while diagnosing; let the user **Cancel**. Never treat mid-stream text as a finished Diagnosis.

```text
Browser  --POST /api/diagnose/stream-->  API (SSE)
           event: status | delta | done | error | cancelled
           AbortController.abort()  -->  connection close  -->  stop
```

## Events

| Event | Meaning |
|-------|---------|
| `status` | Phase label (`brain`, `streaming`, …) |
| `delta` | Append-only **preview** text (not valid JSON) |
| `done` | Full `DiagnoseResponse` (only safe parse) |
| `error` | Failed |
| `cancelled` | Client aborted |

Non-stream `POST /api/diagnose` still exists for evals / scripts.

## Partial JSON pitfall

LLM streams often look like:

```text
{"summary": "Unit test asser
```

If you `JSON.parse` that, it throws — or worse, you invent fields.  
**Rule:** accumulate deltas for display only; commit UI state only on `done`.

## Cancel

1. Click **Cancel** → `AbortController.abort()`  
2. Fetch aborts → server sees `req`/`res` `close` → stops delta loop  
3. No history row if cancelled before `done`

## Prove aloud

1. Diagnose a fixture — see phase + typing preview, then full draft  
2. Start diagnose → **Cancel** mid-preview → “Cancelled”, no final diagnosis  
3. Say why you must not parse `delta` as JSON  

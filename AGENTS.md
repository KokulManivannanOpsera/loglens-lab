# A4 + A4b — Tool agent + safety

**Draft diagnosis ≠ action.** The agent may *propose* writes; humans approve; lab default never calls Jira/GitHub.

```text
diagnose → plan ≤3 steps (allowlist only)
         → grep_log / search_runbook (read)
         → create_ticket_draft → pending_approval (shadow)
         → UI Approve → audit only (AGENT_EXECUTE_WRITES reserved)
```

## Allowlisted tools

| Tool | Side effect | Behavior |
|------|-------------|----------|
| `grep_log` | read | Regex lines from the log |
| `search_runbook` | read | Same RAG path as diagnose |
| `create_ticket_draft` | write | Dry-run draft; needs approve |

Anything else → refused. Max **3** steps per diagnose.

## Refuse patterns (A4b)

- Destructive (`rm -rf`, drop database, delete prod)
- Auto prod deploy
- Bypass gates (merge without review / skip CI)

Refused logs skip the write draft and set `needsHumanReview`.

## API

```bash
# Tool trail lives on every diagnose response:
# meta.agent.toolCalls / pendingApprovals / refusedSignals

curl -sS -X POST http://127.0.0.1:8091/api/agent/approve \
  -H "Content-Type: application/json" \
  -b "loglens_session=…" \
  -d '{"toolCallId":"<id>","approved":true,"draft":{}}'
# → executed: false (shadow) unless you later wire a real destination
```

Env: `AGENT_EXECUTE_WRITES=true` is reserved — lab still does not call external ticket systems.

## Where code lives

| Piece | Path |
|-------|------|
| Python brain agent | `ai/app/agent.py` (wired in `pipeline.py`) |
| Node-local mirror | `server/src/lib/agent.ts` (when AI service off) |
| Approve route | `POST /api/agent/approve` |
| UI trail + Approve | `client` DiagnosisView |

## Prove aloud

1. Diagnose a failing fixture → see Agent trail (grep + search + draft)  
2. Approve → message says shadow / no external write  
3. Paste `rm -rf` + `deploy to production` → refused signals, no ticket draft  

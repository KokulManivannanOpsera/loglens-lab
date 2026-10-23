# BRING — early pack (Design · Chat · UI kit · Cost)

Optional roles pulled in without blocking the AI/DevOps spine.

| Role | Tool here | Doc / code |
|------|-----------|------------|
| Design | CSS tokens + wireframe | [`DESIGN.md`](./DESIGN.md), `client/src/index.css` |
| Chat / on-call light | Slack Incoming Webhook | `server/src/lib/slackNotify.ts` |
| UI kits | shadcn-shaped primitives | `client/src/ui/*` (Button, Badge, Input) |
| Cost | Insights $ proxy | `server/src/lib/costEstimate.ts` |

## Slack setup

1. Slack → Incoming Webhooks → create → copy URL  
2. `SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...` in `.env`  
3. Diagnose a log that needs review → channel gets a message  

Unset URL = no-op (safe for local).

## Cost proxy

Insights shows `estimatedUsd` from `openai` run counts × `COST_USD_PER_OPENAI_RUN` (default `0.0002`). Mock = $0. Not real billing.

## UI kit note

Full **shadcn/ui + Tailwind** is optional later. Early bring uses the same *role* (reusable primitives) with CSS tokens so we don’t rewrite the app bundler mid-lab.

## Prove aloud

1. Tokens: change `--accent` — primary buttons update  
2. Slack: set webhook, force needs-review diagnose, see channel ping  
3. Insights: open Cost card — openai runs drive estimate  
4. UI: History search uses `Input` + `Button` from `ui/`  

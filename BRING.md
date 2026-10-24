# BRING — early + mid packs

Optional roles — one tool each. Spine stays hand-rolled.

## Early (done)

| Role | Tool | Doc / code |
|------|------|------------|
| Design | CSS tokens + wireframe | [`DESIGN.md`](./DESIGN.md) |
| Chat / on-call | Slack Incoming Webhook | `slackNotify.ts` |
| UI kits | Button / Badge / Input | `client/src/ui/` |
| Cost | Insights $ proxy | `costEstimate.ts` |

## Mid (done)

| Role | Tool | Doc / code |
|------|------|------------|
| Load | k6 smoke | [`LOAD.md`](./LOAD.md), `scripts/load/smoke.js` |
| Serving | Ollama local model | `ollamaDiagnose.ts`, `DIAGNOSE_MODE=ollama` |
| Warehouse | DuckDB file | `scripts/etl/load_duckdb.py` |
| ETL light | export CSV → DuckDB | `export-history` + `load_duckdb.py` |

See [`LOAD.md`](./LOAD.md) for commands and prove-aloud.

## Security lite (with D11)

| Role | Tool | Doc |
|------|------|-----|
| Policy / IaC | Checkov on Terraform | [`IAC.md`](./IAC.md) — `npm run iac:checkov` |

## Still optional later

ZAP (DAST), Flux/Argo (after D12), thin LangChain.

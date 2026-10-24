# BRING (mid) — k6 load · Ollama · DuckDB ETL

## 1. Load — k6

Smoke concurrency against health + **mock** diagnose (do not load a paid LLM).

```bash
# install: https://k6.io/docs/get-started/installation/
# API up: npm run dev:node-only  (or full npm run dev)

k6 run scripts/load/smoke.js
# BASE_URL=http://127.0.0.1:8091 VUS=10 DURATION=20s k6 run scripts/load/smoke.js
```

Thresholds: &lt;5% HTTP failures, p95 &lt; 3s.

## 2. Serving — Ollama

Local model when you have no OpenAI key (or force it).

```bash
# install Ollama, then:
ollama pull llama3.2

# server/.env
DIAGNOSE_MODE=ollama
# OLLAMA_BASE_URL=http://127.0.0.1:11434
# OLLAMA_MODEL=llama3.2
```

`auto` mode: if no `OPENAI_API_KEY` and Ollama is reachable (or `OLLAMA_BASE_URL` set), uses Ollama; else mock. OpenAI failure in `auto` may fall through to Ollama then mock.

## 3. Warehouse / ETL — CSV → DuckDB

```bash
npm run export:history --workspace=server
# → server/data/exports/diagnosis_runs.csv

pip install -r scripts/etl/requirements.txt
python3 scripts/etl/load_duckdb.py
# → server/data/exports/loglens.duckdb
```

DuckDB is a **file warehouse stand-in** — BI-shaped SQL without Snowflake.

## Prove aloud

1. k6: “load role = concurrency smoke, mock only”  
2. Ollama: diagnose with `mode=ollama` → provider `ollama`  
3. Export → DuckDB → `GROUP BY provider`  

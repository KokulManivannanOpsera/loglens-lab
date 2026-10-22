# D5 — Deploy LogLens on a PaaS (public HTTPS)

**Goal:** A public HTTPS URL for the UI. Health checks run on the host.  
**Not yet:** staging→prod promotion / rollback gates (**D9**).

```text
Browser ──HTTPS──▶ loglens-web (nginx)
                      │  /api/*
                      ▼
                   loglens-api (Express) ──▶ loglens-ai (FastAPI)
```

Same shape as local compose — platform adds TLS + public DNS.

---

## Primary path: Render Blueprint

Config: [`render.yaml`](./render.yaml)

1. Push this repo to GitHub (already: `loglens-lab`).
2. [Render](https://render.com) → **New** → **Blueprint** → connect the repo.
3. Apply the blueprint (creates `loglens-ai`, `loglens-api`, `loglens-web`).
4. In the dashboard, set **OPENAI_API_KEY** on **ai** (and optionally **api**) if you want real LLM — leave empty for mock.
5. Open the **loglens-web** URL (HTTPS). Sign up → diagnose.
6. Prove health:

```bash
# replace with your web service URL
curl -sS https://YOUR-web.onrender.com/api/health | jq .
# expect: status ok, historyDb true, aiService.ok true/false
```

| Service | Role | Health |
|---------|------|--------|
| `loglens-web` | Public UI + `/api` proxy | `GET /` |
| `loglens-api` | Auth, diagnose, history | `GET /api/health` |
| `loglens-ai` | RAG + LLM | `GET /health` |

**Cookies:** production sets `Secure` session cookies (`COOKIE_SECURE` / `NODE_ENV=production`).  
**Data:** SQLite lives in the container filesystem on free tier (ephemeral on redeploy). Persistent disk / Postgres = later (D7).

If **free** plan is unavailable, edit `plan: free` → `plan: starter` in `render.yaml` and re-apply.

---

## Alternative: Railway (compose-shaped)

Railway can deploy from Dockerfiles / compose. Create three services from `ai/`, `server/`, `client/` Dockerfiles (build context = repo root), set the same env vars as in `render.yaml`, and point `API_UPSTREAM` / `AI_SERVICE_URL` at Railway private service hostnames.

---

## Alternative: Fly.io + GHCR

After **D10**, pull scanned images:

```bash
# example — tag from Actions / Packages
fly apps create loglens-api   # once each
# fly.toml per service + fly secrets set SESSION_SECRET=... OPENAI_API_KEY=...
# image = ghcr.io/<owner>/loglens-api:<sha>
```

Good when you want “deploy the exact SHA Trivy already scanned.”

---

## Local vs PaaS

| | Local (D3) | PaaS (D5) |
|--|------------|-----------|
| Entry | `http://localhost:8088` | `https://….onrender.com` |
| Secrets | `.env` file | Dashboard / `generateValue` |
| TLS | none | platform HTTPS |
| Health | compose healthchecks | Render `healthCheckPath` |

---

## Prove aloud (Progress log)

- Pain: laptop-only URL; no shared demo  
- What: PaaS runs the three containers with HTTPS  
- How: `render.yaml` Blueprint  
- Prove: public URL loads; `curl …/api/health` returns `ok`

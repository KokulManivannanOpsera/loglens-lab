# LogLens Lab

**CI log → draft diagnosis** — learn **AI engineering + DevOps** on one app.

**Architecture (now):** separated **React client** + **Node (Express) API**.

```text
Browser :5173  ──proxy /api──►  Express API :8091  ──►  OpenAI (optional)
```

## Run

```bash
cd labs/loglens
npm install

# terminal 1 — API
cp server/.env.example server/.env   # optional: add OPENAI_API_KEY
npm run dev:server

# terminal 2 — UI
npm run dev:client
```

Open **http://localhost:5173** (UI). API health: **http://localhost:8091/api/health**.

Vite proxies `/api/*` from the UI to the API, so `fetch("/api/diagnose")` works without CORS pain in dev.

## Tests

With the API running on 8091:

```bash
npm test
```

## Learning

- Tracker: [LEARNING.md](./LEARNING.md)
- Flow diagram: [PRODUCT_FLOW.html](./PRODUCT_FLOW.html)
- Git/PR: [GIT_PR.md](./GIT_PR.md)

| Track | Next |
|-------|------|
| AI | Merge A1 PR if open; then A1b / A1c or D6 |
| DevOps | D2 Dockerfile (client+server images or one compose) |

# LogLens Lab

**CI log → draft diagnosis** — learn **AI engineering + DevOps** on one app.

**Architecture (now):** separated **React client** + **Node (Express) API**.

```text
Browser :5173  ──proxy /api──►  Express API :8091  ──►  AI (Python) :8092  ──►  OpenAI (optional)
                                      auth + fixtures         RAG + diagnose
```

## Run

```bash
cd labs/loglens
npm install

cp server/.env.example server/.env   # D6: real key only in .env (gitignored)
# optional: edit server/.env → OPENAI_API_KEY=...

npm run dev   # AI :8092 + API :8091 + UI :5173
```

Open **http://localhost:5173** (UI). **Sign up / log in** first — diagnose and fixtures require a session.

- API health: **http://localhost:8091/api/health** (includes `aiService`)
- AI health: **http://localhost:8092/health**

Vite proxies `/api/*` from the UI to the API (cookies included via `credentials: "include"`).  
Python AI details: **[ai/README.md](./ai/README.md)**.

Without Python: `npm run dev:node-only` (in-process Node diagnose).

## Docker (D2 + D3 + AI service)

See **[DOCKER.md](./DOCKER.md)**. Short version:

```bash
docker compose up --build
# UI  http://localhost:8088
# API http://localhost:8091/api/health
# AI  http://localhost:8092/health
```

## Secrets (D6)

See **[SECRETS.md](./SECRETS.md)**. Short version: key in `server/.env`, never in Git, never in the React client.

## Tests

With the API running on 8091:

```bash
npm test
```

## Learning

- Tracker: [LEARNING.md](./LEARNING.md)
- Agents: [AGENTS.md](./AGENTS.md)
- Streaming: [STREAM.md](./STREAM.md)
- Bringables: [BRING.md](./BRING.md) · [DESIGN.md](./DESIGN.md) · [LOAD.md](./LOAD.md)
- Feedback: [FEEDBACK.md](./FEEDBACK.md)
- IaC: [IAC.md](./IAC.md)
- Flow diagram: [PRODUCT_FLOW.html](./PRODUCT_FLOW.html)
- Git/PR: [GIT_PR.md](./GIT_PR.md)

| Track | Next |
|-------|------|
| AI | A7 optional |
| DevOps | D12 Kubernetes |

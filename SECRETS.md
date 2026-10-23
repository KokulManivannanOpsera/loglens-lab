# D6 — Env & secrets (LogLens)

**Config ≠ code.** Code is in Git. Secrets stay out of Git and out of the browser.

## Rules (memorize)

1. **Real values** live in `server/.env` (gitignored).
2. **Names only** live in `server/.env.example` (committed).
3. **API key stays on the server** — `OPENAI_API_KEY` is read by Express only.
4. **Never** `VITE_OPENAI_API_KEY` (or any `VITE_*` secret) — Vite embeds those in the client bundle.
5. **Health** may say `llmConfigured: true/false` — never echo the key.
6. **Errors / logs** go through redaction (`redactSecrets`) so a leaked key is less likely to appear in JSON.

## Local setup

```bash
cd labs/loglens
cp server/.env.example server/.env
# edit server/.env →
#   OPENAI_API_KEY=sk-...          (optional)
#   SESSION_SECRET=long-random...  (auth cookie signing)
npm run dev
```

**Auth users** are stored in `server/data/users.json` (gitignored under `data/`). Passwords are bcrypt hashes — never plaintext.

Prove ignore:

```bash
git check-ignore -v server/.env
# expect: .gitignore … server/.env
```

## What loads the file

`server/src/lib/secrets.ts` loads `server/.env` via `dotenv` using a path next to the server package (works from monorepo root or `server/`).

## Later (cloud / CI) — same idea, different store

| Where | How the key arrives |
|--------|---------------------|
| Laptop | `server/.env` |
| GitHub Actions | Repository/Environment **Secrets** → env in the job |
| PaaS (Railway, Render, Fly, …) | Dashboard secrets / env vars |
| AWS/GCP | Secrets Manager / SSM — inject at runtime |

You will not commit the key then either. Docker compose will use `env_file:` or orchestrator secrets (D2/D3).

## Prove aloud

- Where does the key live on disk?
- Why can’t the React app call OpenAI directly with the key?
- What does `/api/health` reveal vs hide?

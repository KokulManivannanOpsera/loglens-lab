# LogLens Lab

**CI log → draft diagnosis** — learn **AI engineering + DevOps** on one small app.

**Phase A1 (now):** React + Node (Next.js). **OpenAI** when `OPENAI_API_KEY` is set; otherwise **mock** (A0).

## Run

```bash
cd labs/loglens
npm install
cp .env.example .env.local   # optional: add OPENAI_API_KEY
npm run dev
```

Open [http://localhost:8091](http://localhost:8091).

- Load a fixture → **Diagnose**
- Health: [http://localhost:8091/api/health](http://localhost:8091/api/health) (`llmConfigured: true/false`)

## Tests

```bash
# with app running on 8091
npm test
```

## Learning tracker (everything in one file)

**[LEARNING.md](./LEARNING.md)** — AI ladder + DevOps + full CI/CD + cloud + checklists + progress log.

| Track | Next |
|-------|------|
| AI | A1b / A1c or D6 secrets |
| DevOps | D2 Dockerfile (see [GIT_PR.md](./GIT_PR.md)) |

Todo lab (`labs/todo-devops`) = Docker practice history; **LogLens is the main path**.

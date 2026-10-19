# LogLens Lab

**CI log → draft diagnosis** — learn **AI engineering + DevOps** on one small app.

**Phase A0 (now):** React + Node (Next.js), **mock** diagnosis (no API key), fixture logs.

## Run

```bash
cd labs/loglens
npm install
npm run dev
```

Open [http://localhost:8091](http://localhost:8091).

- Load a fixture → **Diagnose (mock)**
- Health: [http://localhost:8091/api/health](http://localhost:8091/api/health)

## Tests

```bash
# with app running on 8091
npm test
```

## Learning tracker (everything in one file)

**[LEARNING.md](./LEARNING.md)** — AI ladder + DevOps + full CI/CD + cloud + checklists + progress log.

| Track | Next |
|-------|------|
| AI | A1 real LLM |
| DevOps | D2 Dockerfile (D1 done — see [GIT_PR.md](./GIT_PR.md)) |

Todo lab (`labs/todo-devops`) = Docker practice history; **LogLens is the main path**.

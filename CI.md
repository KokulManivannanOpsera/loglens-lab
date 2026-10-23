# D4 — Continuous Integration (GitHub Actions)

## Why
Every PR should prove LogLens still works on a clean machine — not “works on my laptop.”

**Fail closed:** red checks → don’t merge.

## Workflow
File: [`.github/workflows/loglens-ci.yml`](./.github/workflows/loglens-ci.yml)

| Trigger | When |
|---------|------|
| `pull_request` | Any PR |
| `push` to `main`/`master` | After merge |
| `workflow_dispatch` | Manual run (Actions → LogLens CI → Run workflow) |

| Job | Steps |
|-----|--------|
| **Node** | `npm ci` → `npm test` → `npm run eval` (A3 goldens) → `npm run build` |
| **Python AI** | `pip install` → `pytest` in `ai/` |

No OpenAI key required — mock diagnose + local embeddings.

## Local same commands
```bash
cd labs/loglens   # or clone of loglens-lab
npm ci
npm test
npm run eval
npm run build
npm run test:ai
```

## Status checks (after first green run)
GitHub → Settings → Branches → protect `main`:
- Require: **Node — test · eval · build**, **Python AI — pytest**

## Glossary
| Term | Meaning |
|------|---------|
| Workflow | YAML automation file |
| Job | Runs on one runner (can be parallel) |
| Step | One command or action |
| Runner | VM GitHub provides (`ubuntu-latest`) |

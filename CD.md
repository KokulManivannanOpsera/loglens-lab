# D9 — Continuous Delivery (staging → production)

**CI (D4)** proves code. **Images (D10)** prove a scanned artifact. **CD (D9)** chooses **which SHA** is live where — and how to undo it.

```text
PR → CI green → merge
       → Images build/scan/push GHCR :git-sha
       → CD deploy staging  (auto on main Images, or manual)
       → smoke / human check
       → CD deploy production  (manual + Environment approval)
       → bad?  CD rollback production
```

**Delivery** = making a releasable artifact available.  
**Deployment** = putting that artifact on an environment.  
CD automates the path between them with gates.

---

## Workflow

[`.github/workflows/loglens-cd.yml`](./.github/workflows/loglens-cd.yml)

| Trigger | Behavior |
|---------|----------|
| **workflow_dispatch** | Choose `staging` / `production`, `deploy` / `rollback`, optional `git_sha` |
| **workflow_run** (LogLens Images success on `main`/`master`) | Auto **deploy → staging** for that SHA |

What the job does:

1. Resolve image tags `ghcr.io/<owner>/loglens-{api,web,ai}:<sha>`
2. Verify manifests exist on GHCR (fail if Images never pushed that SHA)
3. Create a GitHub **Deployment** for the Environment
4. Write `deploy/<env>.json` (and `deploy/previous-<env>.json` on deploy)
5. Commit the release record (GitOps-lite)
6. Optional: Render deploy hooks + `HEALTH_URL` smoke check

---

## One-time GitHub setup

### Environments
Repo → **Settings** → **Environments** → create:

| Name | Protection |
|------|------------|
| `staging` | none (or wait timer) |
| `production` | **Required reviewers** (you) — approval gate |

### Secrets (optional, per Environment)
| Secret | Purpose |
|--------|---------|
| `HEALTH_URL` | e.g. `https://…/api/health` — smoke after deploy |
| `RENDER_DEPLOY_HOOK_WEB` | Render deploy hook URL for web |
| `RENDER_DEPLOY_HOOK_API` | same for api |
| `RENDER_DEPLOY_HOOK_AI` | same for ai |

Without hooks/URL, CD still **records** the release (useful with local apply / Fly later).

---

## Manual promote / rollback

1. Ensure Images pushed that SHA (Actions → **LogLens Images**).
2. Actions → **LogLens CD** → Run workflow  
   - environment: `staging` → deploy  
   - (later) environment: `production` → deploy (approve if required)
3. Rollback: same workflow, **action = rollback** (uses `deploy/previous-<env>.json`).

---

## Apply GHCR images locally (proves D10)

```bash
# after CD wrote deploy/staging.json with a real sha
export GITHUB_USER=YOUR_USER
export GITHUB_TOKEN=ghp_…   # read:packages if private
./scripts/cd-apply-local.sh staging
curl -sS http://localhost:8088/api/health
```

Compose file: [`docker-compose.cd.yml`](./docker-compose.cd.yml) — **pull images**, no rebuild.

---

## Feature flags (idea only)

CD moves **binaries/images**. Product toggles (e.g. “use new RAG”) can sit behind env `FEATURE_*` or a small flags file — separate from rollback. Blue/green & canary = later once two slots exist.

---

## Prove aloud

- Pain: “latest on my laptop” ≠ what others run  
- What: promote **immutable SHA** staging → prod; rollback = redeploy previous SHA  
- How: LogLens CD + `deploy/*.json` + Environments  
- Prove: run CD → staging; open Deployment in GitHub; `cat deploy/staging.json`

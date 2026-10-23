# D10 — Container registry + scan

## Why
CI proved the **code**. A **registry** stores the **immutable image** you will deploy (same bits staging → prod). Scanning catches known CVEs before you ship.

```text
git SHA → docker build → Trivy scan → push ghcr.io/.../loglens-*:SHA
```

## Images (GHCR)

| Local name | Registry image |
|------------|----------------|
| `loglens-api` | `ghcr.io/<owner>/loglens-api` |
| `loglens-web` | `ghcr.io/<owner>/loglens-web` |
| `loglens-ai` | `ghcr.io/<owner>/loglens-ai` |

**Tags:** full git SHA, short SHA (`sha-abcdef0`), and `latest` on `main`/`master`.

## Workflow
[`.github/workflows/loglens-images.yml`](./.github/workflows/loglens-images.yml)

| Event | Behavior |
|-------|----------|
| **pull_request** | Build + **Trivy** (CRITICAL/HIGH) — **no push** |
| **push to main** / **workflow_dispatch** | Build + Trivy + **push to GHCR** |

## Dependabot
[`.github/dependabot.yml`](./.github/dependabot.yml) — weekly npm + pip, monthly Actions.

## Pull an image (after push)

```bash
# GitHub → Packages → grant read if private; or make package public
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_USER --password-stdin
docker pull ghcr.io/YOUR_USER/loglens-api:sha-SHORT
```

**D9 CD** promotes these tags (see [CD.md](./CD.md)). Local: `./scripts/cd-apply-local.sh staging` + [`docker-compose.cd.yml`](./docker-compose.cd.yml).

## Glossary
| Term | Meaning |
|------|---------|
| Registry | Store for container images (GHCR, ECR, Docker Hub) |
| Tag / digest | Human tag (`:abc1234`) vs content-addressed digest |
| SBOM / CVE scan | What’s inside; known vulnerabilities (Trivy here) |

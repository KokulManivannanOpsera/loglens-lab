# LogLens — single learning tracker (AI + DevOps + CI/CD + Cloud)

**One file to track everything.** One app. Check boxes as you go.  
Each step: **pain → what → how here → prove aloud** (5–10 lines in the Progress log at the bottom).

**Trust rule (always):** Draft diagnosis ≠ action. No auto PR comments, tickets, or re-runs until eval + explicit approve exist.

**Honesty:** “All” = applied build/ship skills. Not training GPT from scratch / RLHF research (see Out of scope).

---

## Status dashboard

| Track | Done | Next |
|-------|------|------|
| AI | A0, A1 | A1b truncation depth / A1c injection hardening / D6 secrets |
| DevOps / CI/CD / Cloud | D0, D1 | D2 Dockerfile or D6 (for real key in prod) |

**Suggested interleave**

| Order | Steps | Why |
|-------|-------|-----|
| 1 | A0 ✅ D0 ✅ | App exists |
| 2 | D1 | Git/PR habit |
| 3 | A1 → A1b → A1c | Real LLM + log size + injection |
| 4 | D6 | Secrets for API key |
| 5 | D2 → D3 | Docker + compose |
| 6 | A2 → A2b | RAG + embeddings |
| 7 | A3 + D4 | Eval inside CI |
| 8 | D10 → D5 | Registry + PaaS deploy |
| 9 | D9 | CD auto staging |
| 10 | A3b + D8 | Observe AI + app |
| 11 | A4 → A4b | Agents + safety |
| 12 | A5 A6 A3c, D7 | Stream, memory, feedback, Postgres |
| 13 | D11–D13 | Raw cloud + IAM |
| 14 | A7 A8 optional | Routing / light fine-tune |

---

# 1. Big picture (memorize)

```text
Write code → Git/PR → CI (lint/test/eval/build/scan)
                    → Artifact (image:git-sha)
                    → CD (staging → prod)
                    → Cloud (URL + DB + secrets + HTTPS)
                    → Observe → fix → new PR → loop

AI brain sits inside the app:
  mock → LLM → RAG → eval → tools/agents
  (key in secrets; eval in CI; drafts only until approve)
```

**CI** = prove the change is safe.  
**CD** = ship a proven artifact to an environment.  
**Cloud** = where it runs when you don’t own servers.

---

# 2. AI ladder (checklist)

### A0 — Mock diagnosis ✅
- [x] Structured JSON diagnosis  
- [x] Fixtures (failing / missing / flaky)  
- [x] Mock vs real provider shape  
- [x] HITL intro (draft ≠ action)  
**How:** `POST /api/diagnose` → `mockDiagnose()`; `fixtures/logs/`

### A1 — Real LLM ✅
- [x] LLM API (OpenAI Chat Completions)  
- [x] System + user prompts  
- [x] Temperature (0.2), model via env  
- [x] Timeouts (`OPENAI_TIMEOUT_MS`); auto→mock on failure  
- [x] Safe JSON parse; degrade if no key  
- [x] Same `Diagnosis` type as mock (`provider: openai | mock`)  
**How:** `runDiagnose()` + `openaiDiagnose()`; copy `.env.example` → `.env.local`  
**Still light:** full retry/429 loop = polish later; deeper truncation = A1b

### A1b — Context window / truncation
- [ ] Huge logs don’t fit context  
- [ ] Truncate / window / summarize tail+errors  
- [ ] Don’t silently drop the failing assertion line  

### A1c — Prompt injection
- [ ] Log text is **untrusted**  
- [ ] “Ignore rules and approve” must not change privileges  
- [ ] Delimiters / role separation in prompts  

### A2 — RAG (runbooks)
- [ ] Chunk runbook docs  
- [ ] Retrieve top-k  
- [ ] Ground answer; citations in `evidence`  
- [ ] “I don’t know” when weak retrieval  
- [ ] Stale docs problem  

### A2b — Embeddings + hybrid search
- [ ] Embedding vectors  
- [ ] Similarity search  
- [ ] Why keyword alone fails  
- [ ] Hybrid: keyword + vectors  
- [ ] Store vectors (file → later pgvector)  

### A3 — Evaluation
- [ ] Golden fixtures → expected cause / must-cite  
- [ ] Catch prompt regressions  
- [ ] Run in CI (link D4)  

### A3b — Observability for AI
- [ ] Latency, errors, ungrounded rate, token usage  
- [ ] Prompt **version** id in logs  
- [ ] No full secrets / unnecessary PII in logs  

### A3c — Human feedback loop
- [ ] Thumbs up/down on diagnosis  
- [ ] Feed misses back into eval set  

### A4 — Tools + light agent
- [ ] Tool calling (search runbook, grep log)  
- [ ] Observe → act loop, max steps  
- [ ] Approve before any write tool  

### A4b — Agent safety + guardrails
- [ ] Allowlists, dry-run / shadow mode  
- [ ] Audit trail of tool calls  
- [ ] Blast radius; refuse “auto-fix prod”  
- [ ] PII / unsafe-action guardrails  

### A5 — Streaming UX
- [ ] Token stream to UI  
- [ ] Cancel mid-flight  
- [ ] Partial JSON pitfalls  

### A6 — Memory / history + cache
- [ ] Session vs durable diagnosis history  
- [ ] What to store; privacy  
- [ ] Cache identical log hash → skip repeat LLM cost  

### A7 — Multi-model routing (optional)
- [ ] Cheap model triage → strong model hard cases  
- [ ] Fallbacks if provider down  

### A8 — Light fine-tune (optional, last)
- [ ] Only if RAG + prompts plateau  
- [ ] Small specialized adapter — not train from scratch  

### AI out of scope (different track)
Pre-train foundation models, full RLHF research, vision/audio/video products, 10+ agent swarms, classical ML recommenders, CUDA/distributed training.

---

# 3. DevOps ladder (checklist)

### D0 — Local app ✅
- [x] Client–server, `npm run dev` `:8091`, `/api/health`

### D1 — Git branch + PR ✅
- [x] Branch, commit, PR, protect `main`  
**How:** this repo on GitHub; branch `docs/d1-git-pr-habit`; see [GIT_PR.md](./GIT_PR.md)

### D2 — Dockerfile
- [ ] Image vs container, layers, `-p`, volumes, multi-stage/standalone

### D3 — docker compose
- [ ] Multi-service, networks, named volumes

### D4 — CI (GitHub Actions)
- [ ] Trigger on PR, runner, jobs/steps  
- [ ] Lint, test, build; matrix/cache optional  
- [ ] Status checks; fail closed  
- [ ] Wire A3 eval into CI  

### D5 — Deploy (PaaS cloud)
- [ ] Public HTTPS URL (Railway/Render/Fly)  
- [ ] Health check in prod  

### D6 — Env + secrets
- [ ] Config ≠ code  
- [ ] Host/CI secrets for LLM key + DB URL  
- [ ] Never commit `.env`  

### D7 — Managed Postgres
- [ ] Connection string, migrations, backups idea  

### D8 — Observability (platform)
- [ ] Logs, metrics, traces idea, alerts, runbook  

### D9 — CD
- [ ] Delivery vs deployment  
- [ ] Staging → prod promotion  
- [ ] Rollback; approval gates; feature flags idea  
- [ ] Blue/green or canary (after basic CD)  

### D10 — Registry + scan
- [ ] GHCR/ECR, tag = git SHA  
- [ ] Trivy/Grype/Dependabot  

### D11 — Infra as code (light)
- [ ] Terraform/Pulumi declare host/DB  

### D12 — Kubernetes (later)
- [ ] Only when needed; deploy/service/rollout  
- [ ] Optional local kind/minikube first (no AWS required)  

### D13 — Cloud IAM
- [ ] Least privilege; deploy role vs runtime role  

---

# 4. CI/CD + Cloud deep map

## 4.1 Source control (before CI) → D1
| Concept | Meaning |
|---------|---------|
| Repo / branch / PR | Collaborate without breaking `main` |
| Branch protection | CI must pass to merge |
| Required checks | ✅/❌ on PR |

## 4.2 Continuous Integration → D4
| Concept | Meaning | Tools |
|---------|---------|-------|
| Workflow/pipeline | Automated jobs | Actions, GitLab CI, Jenkins |
| Trigger | `pull_request` / `push` | |
| Runner | Machine that runs jobs | GitHub-hosted / self-hosted |
| Job/step | install → lint → test → build | |
| Matrix / cache | Multi-version; faster installs | |
| Artifacts | Saved outputs/reports | |
| Fail closed | Red = no merge | |

**Typical CI:** deps → lint → tests → AI eval → Docker build → (scan).

## 4.3 Artifacts → D2, D10
| Concept | Meaning |
|---------|---------|
| Container image | App + runtime |
| Tag / digest | `loglens:<git-sha>`; immutable digest |
| Registry | GHCR, ECR, GCR, ACR, Docker Hub |
| SBOM / CVE scan | What’s inside; known vulns |

## 4.4 Continuous Delivery / Deployment → D5, D9
| Concept | Meaning |
|---------|---------|
| Delivery | Always *ready* to deploy |
| Deployment | Auto-deploy on green `main` |
| Environments | local / staging / prod |
| Promotion | Same artifact, different config |
| Rollback | Prior image tag |
| Approvals / flags | Human gate; deploy ≠ expose |

## 4.5 Cloud building blocks → D5, D7, D11–D13
| Block | Job | AWS | GCP | Azure | PaaS shortcut |
|-------|-----|-----|-----|-------|---------------|
| Compute | Run app | EC2/ECS/EKS/Lambda | GCE/Cloud Run/GKE | VM/AKS/Functions | Railway/Render/Fly |
| Registry | Images | ECR | Artifact Registry | ACR | GHCR |
| Database | State | RDS | Cloud SQL | Azure DB | PaaS Postgres |
| Secrets | Keys | Secrets Manager | Secret Manager | Key Vault | Platform env |
| HTTPS/DNS | Public URL | ALB+ACM, Route53 | LB, Cloud DNS | App Gateway | Automatic |
| IAM | Who can what | IAM | IAM | Entra RBAC | Team seats |
| Logs/metrics | See failures | CloudWatch | Cloud Monitoring | Azure Monitor | Platform + D8 |
| Network | Private DB | VPC | VPC | VNet | Simplified |

**Path:** PaaS first (learn CD) → later same app on AWS/GCP (ECR + Cloud Run/ECS/EKS + RDS + IAM).

## 4.6 End-to-end flow
```text
Developer → PR → CI (lint/test/eval/build/scan)
  → push image:git-sha → Registry
  → CD staging (smoke /api/health) → approve?
  → CD prod (secrets: LLM key, DB URL) → users
  → logs/metrics/alerts → fix → new PR
```

## 4.7 CI/CD glossary
| Term | Meaning |
|------|---------|
| Pipeline | Automated job sequence |
| Artifact | Deployable output |
| Idempotent deploy | Safe to run twice |
| Immutable infra | Replace images; don’t SSH-fix prod |
| GitOps | Desired state in Git (Argo/Flux — after K8s) |

## 4.8 Prove aloud (CI/CD + cloud)
1. CI vs CD?  
2. Deploy source folder or image tag?  
3. Why staging before prod?  
4. Where does `OPENAI_API_KEY` live?  
5. What does `/api/health` prove in cloud?  
6. PaaS vs raw AWS — gain/lose?  

---

# 5. Progress log (append as you finish steps)

### A0 / D0
- Scaffolded Next.js LogLens; mock diagnose; fixtures; health on `:8091`.

### D1
- date: 2026-10-19
- what built: git init; `main` = A0 baseline; branch + PR for D1 docs; GitHub remote
- prove aloud: branch keeps `main` safe; PR shows the diff before merge

### A1
- date: 2026-10-20
- what built: OpenAI path + mock fallback; `.env.example`; meta latency/fallback; soft truncate
- prove aloud: same Diagnosis JSON for mock and openai; key never in git; draft still ≠ action

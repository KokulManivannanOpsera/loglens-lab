# LogLens — single learning tracker (AI + DevOps + CI/CD + Cloud)

**One file to track everything.** One app. Check boxes as you go.  
Each step: **pain → what → how here → prove aloud** (5–10 lines in the Progress log at the bottom).

**Trust rule (always):** Draft diagnosis ≠ action. No auto PR comments, tickets, or re-runs until eval + explicit approve exist.

**Honesty:** “All” = applied build/ship skills. Not training GPT from scratch / RLHF research (see Out of scope).

**Visual (all tools + roles):** open [`PRODUCT_FLOW.html`](./PRODUCT_FLOW.html) in a browser — AI + CI/CD + cloud on one diagram.

**Phase study notes (canvas):** after each phase’s code is done, update Cursor canvas `LogLens-Phase-Notes` — tools (problem → what → here → think → watch out → try this), DiffView snippets, and new libraries under LIBS. Same format every time.

**Deep concepts (canvas):** long-form, **project-agnostic** explanations (LLM, CORS, reverse proxy, login/SSO/OAuth/OIDC, …) live in Cursor canvas `Concepts-Deep-Dive` (**Login & identity** tab). Keep `LogLens-Phase-Notes` for LogLens phase tools/snippets only.

---

## Status dashboard

| Track | Done | Next |
|-------|------|------|
| AI | A0–A2b, **A3** ✅ (+ Python brain) | A3b observe / A4 agents |
| DevOps | D0–D3, D6, AUTH, **D4** ✅ | **D10** registry / **D5** PaaS |
| Data | **DATA-0** ✅ | D7 Postgres; Redis; real queue |
| Architecture | SPLIT + **MS** (web/api/ai) ✅ | — |
| Coverage | BRING listed (not built) | Pull bringables when spine allows |

**Full phase list (do in this order)**

| # | Phase | Status | What |
|---|-------|--------|------|
| 1 | **A0** Mock diagnosis + fixtures | ✅ | JSON contract, fixtures, HITL intro |
| 2 | **D0** Local app + health | ✅ | Client–server, `/api/health` |
| 3 | **D1** Git branch + PR | ✅ | Branch → PR habit |
| 4 | **A1** Real LLM + mock fallback | ✅ | OpenAI, timeout, JSON validate |
| 5 | **A1b** Error-aware truncation | ✅ | Context window / truncateLog |
| 6 | **A1c** Prompt injection | ✅ | promptGuard, untrusted log |
| 7 | **D6** Env + secrets | ✅ | `.env`, redact, health boolean |
| 8 | **AUTH** Signup / login | ✅ | bcrypt + httpOnly JWT cookie |
| 9 | **D2** Docker images | ✅ | api + web (+ ai) Dockerfiles |
| 10 | **D3** docker compose | ✅ | ai + api + web network |
| 11 | **A2** Keyword RAG | ✅ | Chunk / retrieve / cite runbooks |
| 12 | **MS** Python AI microservice | ✅ | FastAPI brain, Express gateway |
| 13 | **DATA-0** History & Insights | ✅ | SQLite, FTS, cache, queue, Insights UI |
| 14 | **A2b** Embeddings + hybrid RAG | ✅ | Vectors, similarity, hybrid retrieve |
| 15 | **A3** AI evals | ✅ | Golden fixtures, score + regressions |
| 16 | **D4** CI (GitHub Actions) | ✅ | test + eval + build on PR |
| 17 | **BRING** (early) | ☐ | Design tokens, Slack webhook, Insights cost, shadcn |
| 18 | **D10** Registry + scan | ☐ | GHCR, Trivy/Grype, Dependabot |
| 19 | **D5** PaaS deploy | ☐ | Public HTTPS URL |
| 20 | **D9** CD | ☐ | Staging → prod, rollback |
| 21 | **BRING** (mid) | ☐ | k6 load, Ollama, DuckDB + export ETL |
| 22 | **A3b** + **D8** Observe | ☐ | Metrics/logs; AI ungrounded rate |
| 23 | **A4** + **A4b** Agents + safety | ☐ | Tools, allowlists, no auto-write |
| 24 | **A5** Streaming UX | ☐ | Token stream, cancel |
| 25 | **A3c** Human feedback | ☐ | Thumbs → eval set |
| 26 | **D7** Managed Postgres | ☐ | Swap SQLite schema → Postgres |
| 27 | **BRING** (security) | ☐ | ZAP baseline (after D5), Checkov (with D11) |
| 28 | **D11** IaC light | ☐ | Terraform/Pulumi |
| 29 | **D12** Kubernetes | ☐ | kind/minikube → manifests |
| 30 | **BRING** (GitOps) | ☐ | Flux/Argo after D12 |
| 31 | **D13** Cloud IAM | ☐ | Least privilege |
| 32 | **A7** / **A8** optional | ☐ | Model routing / light fine-tune |

**Stay out:** service mesh (Istio/Linkerd).

**Reference canvases:** Phase Notes (incl. **BRING**) · Coverage map · Software engineering tools

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

### A1b — Context window / truncation ✅
- [x] Huge logs don’t fit context  
- [x] Truncate / window: head + **error windows** + tail (fallback head+tail)  
- [x] Don’t silently drop the failing assertion line  
**How:** `truncateLog()` in `server/src/lib/truncateLog.ts`; meta `truncateStrategy` / `keptErrorLines`; tests in `truncateLog.test.ts`

### A1c — Prompt injection ✅
- [x] Log text is **untrusted**  
- [x] “Ignore rules and approve” must not change privileges  
- [x] Delimiters / role separation in prompts  
**How:** `promptGuard.ts` (scan + wrap + HITL enforce); stronger SYSTEM; fixture `prompt-injection`; meta `injectionSuspected`

### A2 — RAG (runbooks) ✅
- [x] Chunk runbook docs (`server/knowledge/runbooks/*.md` on `##` headings)  
- [x] Retrieve top-k (keyword overlap — no vectors yet)  
- [x] Ground answer; `runbook:…` citations in `evidence`  
- [x] Weak retrieval → `ragWeak` + needsHumanReview / softer confidence  
- [x] Stale docs called out in runbook + Concepts  
**How:** `server/src/lib/rag.ts` → `retrieveRunbooks` + `groundWithRag` in `runDiagnose`; LLM gets RUNBOOK CONTEXT  
**Microservice:** Python FastAPI `ai/` owns the same RAG+diagnose path; Express calls `AI_SERVICE_URL` (`meta.brain: python`) with node-local fallback  
**Next:** done — see A2b  

### A2b — Embeddings + hybrid search ✅
- [x] Embedding vectors (local hashing + optional OpenAI `text-embedding-3-small`)  
- [x] Similarity search (cosine over cached vectors)  
- [x] Why keyword alone fails (paraphrase “hung” vs timeout runbook)  
- [x] Hybrid: keyword + vectors (`RAG_MODE=hybrid` default)  
- [x] Store vectors in file (`server/data/rag-vectors.json` → later pgvector)  
**How:** `embeddings.ts` / `ai/app/embeddings.py`; `retrieveRunbooksAsync`; env `RAG_MODE`, `EMBEDDING_PROVIDER`  
**Meta:** `ragMode`, `ragEmbeddingProvider`, `ragEmbeddingModel`  


### A3 — Evaluation ✅
- [x] Golden fixtures → expected cause / must-cite / HITL / RAG  
- [x] Catch prompt / RAG regressions (`npm run eval`)  
- [x] Run in CI (D4 — `npm run eval` in LogLens CI workflow)  
**How:** `server/evals/goldens.json` + `evalScore.ts` + `runEvals.ts`; `npm run eval --workspace=server`; also `tests/eval.test.ts`  
**Trust:** mock mode for deterministic CI; live LLM eval is optional later  


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
- [x] Durable diagnosis history (DATA-0 SQLite)  
- [x] Cache identical log hash → skip repeat LLM cost  
- [ ] Privacy / retention policy polish  
- [ ] Cross-device session history (needs shared DB — D7) 

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

### D2 — Dockerfile ✅
- [x] Image vs container, layers, `-p`, volumes, multi-stage  
- [x] API image (`server/Dockerfile` → `node dist/index.js`)  
- [x] UI image (`client/Dockerfile` → nginx + Vite `dist`, proxies `/api`)  
**How:** [DOCKER.md](./DOCKER.md); tags `loglens-api:0.1`, `loglens-web:0.1`

### D3 — docker compose ✅
- [x] Multi-service (`api` + `web`)  
- [x] Default network (service DNS: `api`)  
- [x] Named volume `loglens-data` for users  
- [x] `depends_on` + API healthcheck  
**How:** `docker-compose.yml` → `docker compose up --build` → UI :8088  

### D4 — CI (GitHub Actions) ✅
- [x] Trigger on PR/push (path: `labs/loglens/**`)  
- [x] Jobs/steps: Node test + **A3 eval** + build; Python pytest  
- [x] npm cache; fail closed (job fails → red check)  
- [x] Wire A3 eval into CI (`npm run eval`)  
**How:** [`.github/workflows/loglens-ci.yml`](./.github/workflows/loglens-ci.yml); [CI.md](./CI.md)  
**You still do:** after first green run, require those checks on `main` (branch protection)  


### D5 — Deploy (PaaS cloud)
- [ ] Public HTTPS URL (Railway/Render/Fly)  
- [ ] Health check in prod  

### D6 — Env + secrets ✅
- [x] Config ≠ code (`server/.env.example` vs `server/.env`)  
- [x] Never commit `.env` (gitignore + `SECRETS.md`)  
- [x] Key only on server; health boolean; error redaction  
- [ ] Host/CI secrets store (later when we have CI/deploy — same idea)  
**How:** `server/src/lib/secrets.ts`, `SECRETS.md`, `git check-ignore -v server/.env`

### AUTH — Signup / login ✅
- [x] Sign up + log in + log out  
- [x] Passwords hashed (bcrypt); session JWT in **httpOnly** cookie  
- [x] Protect diagnose + fixtures behind auth  
- [x] `SESSION_SECRET` in env (see `SECRETS.md`)  
**How:** `server/src/lib/auth.ts`, `users.ts`, `routes/auth.ts`; UI `AuthScreen.tsx`  
**Lab store:** `server/data/users.json` (later: Postgres in D7)

### DATA-0 — History & Insights ✅
**Why:** Cover **Data & quality** roles with one product feature (not a warehouse zoo).

| Data role | How LogLens covers it |
|-----------|------------------------|
| Relational DB | SQLite `diagnosis_runs` (`better-sqlite3`) |
| Migrations | `server/src/db/migrations/*.sql` + `schema_migrations` |
| ORM / data access | Thin repo `history.ts` (Prisma/Drizzle optional later) |
| Search | SQLite **FTS5** over cause/summary/preview |
| KV / cache | In-process `diagCache` by `logHash` (Redis later) |
| Queue | In-process `jobQueue` → `audit.jsonl` (Rabbit/SQS later) |
| Analytics / BI-lite | `/api/history/insights` + Insights UI (GROUP BY) |
| Tests | `server/tests/history.test.ts` |

- [x] Persist every diagnose (per user)  
- [x] History list + FTS search + open past run  
- [x] Insights aggregates (provider, brain, confidence, top causes, review rate)  
- [x] Same-log cache skips repeat LLM within TTL  
- [x] UI tabs: Diagnose · History · Insights  
**How:** `server/src/db/*`, `lib/history.ts`, `lib/diagCache.ts`, `lib/jobQueue.ts`, `routes/history.ts`; client tabs in `LogLensApp.tsx`  
**Not yet:** managed Postgres (D7), Redis, real message broker, Snowflake/dbt  

### D7 — Managed Postgres
- [ ] Swap/dual `DATABASE_URL` (same schema as DATA-0)  
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

### Bringables (was “No” on coverage map)
See canvas **LogLens — role coverage map** and Phase Notes phase **BRING**. Pull these in when the spine allows — one tool each.

| Role | Bring with | Tool |
|------|------------|------|
| Design | anytime | CSS tokens + wireframe doc (Excalidraw/Figma) |
| Chat / on-call light | after AUTH | Slack Incoming Webhook |
| UI kit | UI polish | shadcn/ui |
| Load | after D4 | k6 vs health/diagnose |
| GitOps | after D12 | Flux or Argo CD (thin) |
| Cost | with Insights | token/$ estimate on Insights |
| DAST | after D5 | OWASP ZAP baseline in CI |
| Policy / IaC | with D11 | Checkov / tfsec |
| AI frameworks | optional | thin LangChain/LlamaIndex |
| Serving | optional | Ollama local fallback |
| Warehouse stand-in | after DATA-0 | DuckDB from export |
| ETL light | after DATA-0 | script/Prefect → CSV/DuckDB |

**Stay out:** service mesh (Istio/Linkerd) — not worth it for 3 services.

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

### Split client/server
- date: 2026-10-20
- what built: Vite React `client/` + Express `server/`; Vite proxies `/api` → `:8091`
- prove aloud: browser is client; Express is server; Next monolith removed

### A1b
- date: 2026-10-21
- what built: error-aware truncation (head + error windows + tail); meta strategy; unit test that AssertionError in the middle survives
- prove aloud: naive head+tail can drop the fail line; A1b keeps it and still forces human review when truncated

### A1c
- date: 2026-10-21
- what built: delimited untrusted log wrapper; injection scan; strip unsafe nextSteps; fixture prompt-injection
- prove aloud: log cannot clear HITL or demand auto PR/deploy; product policy beats model output

### D6
- date: 2026-10-21
- what built: secrets.ts loader + redact; SECRETS.md; tighter gitignore; .env.example docs
- prove aloud: key never in git or browser; health only says configured yes/no

### AUTH
- date: 2026-10-21
- what built: signup/login/logout; bcrypt hashes; httpOnly JWT cookie; gate diagnose/fixtures
- prove aloud: browser never sees password hash or JWT; unauthenticated diagnose → 401

### D2
- date: 2026-10-21
- what built: multi-stage Dockerfiles for API + nginx UI; shared network run; volume for users data
- prove aloud: image ≠ container; -p publishes ports; nginx proxies /api to API container by DNS name

### D3
- date: 2026-10-22
- what built: docker-compose.yml (api + web + volume + healthcheck + depends_on)
- prove aloud: one `compose up` replaces hand-typed docker run; web reaches API via service name `api`

### A2
- date: 2026-10-22
- what built: runbook markdown knowledge; chunk + keyword top-k; ground mock/LLM; UI RAG meta
- prove aloud: diagnosis can cite runbooks; weak retrieval refuses overconfidence; docs can go stale

### Microservices (Python AI)
- date: 2026-10-22
- what built: FastAPI `ai/` service; Express `AI_SERVICE_URL` client; compose `ai`+`api`+`web`
- prove aloud: auth stays on api; brain is a separate process; compose DNS `ai:8092`; fallback to node-local if AI down

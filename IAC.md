# D11 — Infra as code (light)

**Idea:** Desired host/app shape lives in **Git**, not click-ops.  
`terraform plan` = diff vs reality. `apply` = make reality match code.

```text
Git (*.tf)  →  terraform plan  →  terraform apply  →  Docker (local lab)
                                                      (later: cloud APIs)
```

This lab uses the **Docker provider** so you can practice IaC **without** an AWS/Render card.  
Same mental model as declaring Render/ECS/K8s — different provider.

Config: [`infra/terraform/`](./infra/terraform/)

---

## Prereqs

1. [Terraform](https://developer.hashicorp.com/terraform/install) ≥ 1.5  
2. Docker running  
3. Images built:

```bash
npm run docker:build
# tags: loglens-ai:0.1  loglens-api:0.1  loglens-web:0.1
```

---

## Commands

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # optional; edit ports / postgres

terraform init
terraform plan
terraform apply   # creates network + ai + api + web (+ optional db)

# UI
open http://127.0.0.1:8088

terraform destroy
```

Postgres History (D7):

```bash
terraform apply -var='enable_postgres=true'
```

Secrets: use `TF_VAR_session_secret` / `TF_VAR_openai_api_key` — do **not** commit `terraform.tfvars` with real keys.

---

## IaC vs what we already had

| Tool | Role |
|------|------|
| `docker-compose.yml` | Local orchestration (YAML, great for lab) |
| `render.yaml` | PaaS blueprint (host’s IaC dialect) |
| **Terraform `*.tf`** | Provider-agnostic desired state + plan/apply/destroy |

Compose and Terraform can both create containers; Terraform teaches **plan drift** and cloud-shaped workflows.

---

## Checkov (policy / IaC scan) — BRING security lite

```bash
# pip install checkov
npm run iac:checkov
# same as: checkov -d infra/terraform --framework terraform
```

Catches common misconfig (e.g. overly open security groups in cloud modules).  
With only Docker resources, findings may be few — still practice the **scan IaC in CI** habit.

---

## Prove aloud

1. IaC vs click-ops — where does desired state live?  
2. `plan` vs `apply`?  
3. Why are secrets not in Git?  
4. How is this like Databricks/cloud: declare resources, apply, review drift?  

---

## Later (not this phase)

- Real cloud: AWS ECS/RDS or Render Terraform provider  
- **D12** Kubernetes manifests  
- **D13** IAM least privilege for the deploy role  

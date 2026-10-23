# Docker — LogLens (D2 images + D3 compose + D10 registry)

After local compose works, CI can **scan + push** images to GHCR — see [REGISTRY.md](./REGISTRY.md).  
Public HTTPS host (PaaS) — see [DEPLOY.md](./DEPLOY.md) + [`render.yaml`](./render.yaml).

**Image** = packaged filesystem + metadata (what you `build` / push).  
**Container** = a running instance of an image (`run`).  
**Compose** = one YAML file that declares services, network, volumes, ports, env.

```text
web  (loglens-web:0.1)  →  nginx :80  →  proxies /api → api:8091
api  (loglens-api:0.1)  →  Express :8091  →  AI_SERVICE_URL=http://ai:8092
ai   (loglens-ai:0.1)   →  FastAPI :8092  (RAG + mock/LLM)
```

---

## D3 — recommended: docker compose

From `labs/loglens`:

```bash
# optional: cp .env.example .env   # SESSION_SECRET, OPENAI_API_KEY, WEB_PORT

docker compose up --build
```

| URL | What |
|-----|------|
| http://localhost:8088 | UI (sign up → diagnose) |
| http://localhost:8091/api/health | API (+ `aiService` status) |
| http://localhost:8092/health | Python AI brain |

`8088` is the default host port for the UI (avoids clashing with tools that use `8080`). Override with `WEB_PORT=8080` in `.env` if free.

Useful:

```bash
docker compose up --build -d    # detached
docker compose logs -f
docker compose ps
docker compose down             # stop & remove containers (keeps volume)
docker compose down -v          # also delete users volume
```

Compose creates a **default network** so `web` reaches the API at hostname **`api`** (`API_UPSTREAM=http://api:8091`). Named volume **`loglens-data`** mounts to `/app/server/data` for `users.json`.

---

## D2 — build / run by hand (still useful to understand)

```bash
docker build -f server/Dockerfile -t loglens-api:0.1 .
docker build -f client/Dockerfile -t loglens-web:0.1 .

docker network create loglens-net   # once

docker run -d --name loglens-api --network loglens-net \
  -p 8091:8091 \
  -e SESSION_SECRET=change-me-to-a-long-random-string \
  -v loglens-data:/app/server/data \
  loglens-api:0.1

docker run -d --name loglens-web --network loglens-net \
  -p 8088:80 \
  -e API_UPSTREAM=http://loglens-api:8091 \
  loglens-web:0.1
```

Manual run uses the **container name** `loglens-api` as DNS. Compose uses the **service name** `api`. Same idea, different name.

Secrets: pass with `-e` / compose `environment` / `.env` — never bake into the image.

---

## Mental model

```text
Dockerfile     →  image
docker run     →  one container (many flags)
compose.yml    →  multi-container app as code (network + volume + depends_on)
```

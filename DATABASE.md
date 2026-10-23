# D7 — Database (SQLite ↔ Postgres)

**Same History / Insights product.** Engine switches with one env var.

| | Default (lab) | Postgres (D7) |
|--|---------------|---------------|
| Trigger | `DATABASE_URL` unset | `DATABASE_URL=postgres://…` |
| Engine | SQLite file | Managed / compose Postgres |
| Search | FTS5 virtual table | `tsvector` + `plainto_tsquery` (+ ILIKE) |
| Migrations | `server/src/db/migrations/*.sql` | `server/src/db/migrations/postgres/*.sql` |

```text
DIAGNOSE → saveDiagnosisRun()
              ├─ no DATABASE_URL  → better-sqlite3
              └─ DATABASE_URL set → pg Pool
```

## Local SQLite (unchanged)

```bash
npm run dev
# or
docker compose up --build
```

Health: `"db": { "engine": "sqlite", "label": "…/loglens.db" }`

## Local Postgres (compose profile)

```bash
# labs/loglens/.env
DATABASE_URL=postgres://loglens:loglens@db:5432/loglens

docker compose --profile postgres up --build
```

Or API on the host against compose Postgres (mapped to **5433**):

```bash
docker compose --profile postgres up -d db
export DATABASE_URL=postgres://loglens:loglens@127.0.0.1:5433/loglens
npm run dev --workspace=server
```

## Hosted / “managed”

- **Render / Railway / Neon / RDS / Cloud SQL:** create a Postgres instance → copy connection string → set `DATABASE_URL` on the **api** service (never commit it).
- **Backups:** use the provider’s automated backups / PITR — app code doesn’t invent backups. Lab idea: snapshot before risky migrations.

## Prove

```bash
curl -sS http://127.0.0.1:8091/api/health | jq .db
# expect engine sqlite | postgres
```

Diagnose → History tab still works; data lives in the engine you selected.

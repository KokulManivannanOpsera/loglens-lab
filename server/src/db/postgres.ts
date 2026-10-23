import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

let pool: pg.Pool | null = null;

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL?.trim() ?? "";
}

export function usePostgres(): boolean {
  return getDatabaseUrl().length > 0;
}

export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error("Postgres pool not initialized — call initPostgres() first");
  }
  return pool;
}

export async function initPostgres(): Promise<void> {
  if (pool) return;
  const url = getDatabaseUrl();
  if (!url) throw new Error("DATABASE_URL is empty");
  pool = new Pool({ connectionString: url });
  await pool.query("SELECT 1");
  await runPostgresMigrations(pool);
}

async function runPostgresMigrations(database: pg.Pool): Promise<void> {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL
    );
  `);

  const beside = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "migrations",
    "postgres",
  );
  const fromRoot = path.join(serverRoot, "src/db/migrations/postgres");
  const migrationsDir = fs.existsSync(beside) ? beside : fromRoot;
  if (!fs.existsSync(migrationsDir)) return;

  const appliedRes = await database.query<{ id: string }>(
    "SELECT id FROM schema_migrations",
  );
  const applied = new Set(appliedRes.rows.map((r) => r.id));

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (id, applied_at) VALUES ($1, NOW())",
        [file],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

export async function closePostgres(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Redact password for logs / health. */
export function databaseUrlLabel(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "postgres://***";
  }
}

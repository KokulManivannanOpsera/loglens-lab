import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  closePostgres,
  databaseUrlLabel,
  getDatabaseUrl,
  initPostgres,
  usePostgres,
} from "./postgres.js";

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

let db: Database.Database | null = null;

export { usePostgres } from "./postgres.js";

export function getDbPath(): string {
  const fromEnv = process.env.SQLITE_PATH?.trim();
  if (fromEnv) return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(fromEnv);
  return path.join(serverRoot, "data", "loglens.db");
}

export type DbInfo = {
  engine: "sqlite" | "postgres";
  label: string;
};

export function getDbInfo(): DbInfo {
  if (usePostgres()) {
    return {
      engine: "postgres",
      label: databaseUrlLabel(getDatabaseUrl()),
    };
  }
  return { engine: "sqlite", label: getDbPath() };
}

/** Open SQLite or Postgres (migrations). Call once at boot. */
export async function initDb(): Promise<DbInfo> {
  if (usePostgres()) {
    await initPostgres();
    return getDbInfo();
  }
  getSqliteDb();
  return getDbInfo();
}

/** Open SQLite (creates file + runs migrations once). */
export function getSqliteDb(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runSqliteMigrations(db);
  return db;
}

/** @deprecated Prefer getSqliteDb / initDb — kept for older imports */
export function getDb(): Database.Database {
  if (usePostgres()) {
    throw new Error("getDb() is SQLite-only; DATABASE_URL is set — use history helpers");
  }
  return getSqliteDb();
}

function runSqliteMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const beside = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
  const fromRoot = path.join(serverRoot, "src/db/migrations");
  const migrationsDir = fs.existsSync(beside) ? beside : fromRoot;
  if (!fs.existsSync(migrationsDir)) return;

  const applied = new Set(
    (
      database
        .prepare("SELECT id FROM schema_migrations")
        .all() as { id: string }[]
    ).map((r) => r.id),
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql") && !fs.statSync(path.join(migrationsDir, f)).isDirectory())
    .sort();

  const insert = database.prepare(
    "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const run = database.transaction(() => {
      database.exec(sql);
      insert.run(file, new Date().toISOString());
    });
    run();
  }
}

/** Test helper — close SQLite and/or Postgres pool. */
export async function closeDb(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
  await closePostgres();
}

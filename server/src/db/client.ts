import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

let db: Database.Database | null = null;

export function getDbPath(): string {
  const fromEnv = process.env.SQLITE_PATH?.trim();
  if (fromEnv) return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(fromEnv);
  return path.join(serverRoot, "data", "loglens.db");
}

/** Open SQLite (creates file + runs migrations once). */
export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  // Prefer beside this module (dev); fall back to serverRoot for Docker dist layout
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
    .filter((f) => f.endsWith(".sql"))
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

/** Test helper — close and reopen against a fresh path. */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

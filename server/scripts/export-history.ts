/**
 * BRING — ETL light: export diagnosis_runs → CSV for DuckDB / warehouse stand-in.
 *
 *   npm run export:history --workspace=server
 *   → server/data/exports/diagnosis_runs.csv
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { closeDb, initDb, usePostgres } from "../src/db/client.js";
import { getSqliteDb } from "../src/db/client.js";
import { getPool } from "../src/db/postgres.js";

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outDir = path.join(serverRoot, "data", "exports");
const outFile = path.join(outDir, "diagnosis_runs.csv");

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function rows(): Promise<Record<string, unknown>[]> {
  if (usePostgres()) {
    const res = await getPool().query(
      `SELECT id, user_id, created_at, fixture_id, provider, brain,
              likely_cause, summary, confidence, needs_human_review, rag_weak
       FROM diagnosis_runs ORDER BY created_at`,
    );
    return res.rows as Record<string, unknown>[];
  }
  return getSqliteDb()
    .prepare(
      `SELECT id, user_id, created_at, fixture_id, provider, brain,
              likely_cause, summary, confidence, needs_human_review, rag_weak
       FROM diagnosis_runs ORDER BY created_at`,
    )
    .all() as Record<string, unknown>[];
}

const boot = await initDb();
const data = await rows();
const headers = [
  "id",
  "user_id",
  "created_at",
  "fixture_id",
  "provider",
  "brain",
  "likely_cause",
  "summary",
  "confidence",
  "needs_human_review",
  "rag_weak",
];

fs.mkdirSync(outDir, { recursive: true });
const lines = [
  headers.join(","),
  ...data.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
];
fs.writeFileSync(outFile, `${lines.join("\n")}\n`, "utf8");
console.log(
  `Exported ${data.length} rows (${boot.engine}) → ${outFile}`,
);
await closeDb();

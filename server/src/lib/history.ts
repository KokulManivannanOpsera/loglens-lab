import { createHash, randomUUID } from "crypto";
import { getSqliteDb, usePostgres } from "../db/client.js";
import { getPool } from "../db/postgres.js";
import { estimateDiagnoseCost, type CostEstimate } from "./costEstimate.js";
import { getFeedback, type FeedbackRecord } from "./feedback.js";
import type { DiagnoseResponse, Diagnosis } from "./types.js";

export type HistoryListItem = {
  id: string;
  createdAt: string;
  logPreview: string;
  fixtureId: string | null;
  provider: string;
  brain: string;
  likelyCause: string;
  summary: string;
  confidence: string;
  needsHumanReview: boolean;
  ragWeak: boolean;
};

export type HistoryDetail = HistoryListItem & {
  logHash: string;
  diagnosis: Diagnosis;
  meta: DiagnoseResponse["meta"];
  /** A3c — latest thumbs for this run (if any) */
  feedback?: FeedbackRecord | null;
};

export type Insights = {
  totalRuns: number;
  needsReviewCount: number;
  needsReviewRate: number;
  ragWeakCount: number;
  byProvider: { provider: string; count: number }[];
  byBrain: { brain: string; count: number }[];
  byConfidence: { confidence: string; count: number }[];
  topCauses: { cause: string; count: number }[];
  /** BRING — FinOps-lite LLM $ proxy */
  costEstimate: CostEstimate;
};

export function hashLog(logText: string): string {
  return createHash("sha256").update(logText).digest("hex");
}

function rowToListItem(row: Record<string, unknown>): HistoryListItem {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    logPreview: String(row.log_preview),
    fixtureId: row.fixture_id == null ? null : String(row.fixture_id),
    provider: String(row.provider),
    brain: String(row.brain),
    likelyCause: String(row.likely_cause),
    summary: String(row.summary),
    confidence: String(row.confidence),
    needsHumanReview: Boolean(row.needs_human_review),
    ragWeak: Boolean(row.rag_weak),
  };
}

export async function saveDiagnosisRun(input: {
  userId: string;
  logText: string;
  fixtureId?: string | null;
  response: DiagnoseResponse;
}): Promise<string> {
  if (usePostgres()) return saveDiagnosisRunPg(input);
  return saveDiagnosisRunSqlite(input);
}

function saveDiagnosisRunSqlite(input: {
  userId: string;
  logText: string;
  fixtureId?: string | null;
  response: DiagnoseResponse;
}): string {
  const db = getSqliteDb();
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const logHash = hashLog(input.logText);
  const logPreview = input.logText.trim().slice(0, 240);
  const { diagnosis, meta } = input.response;

  const insertRun = db.prepare(`
    INSERT INTO diagnosis_runs (
      id, user_id, created_at, log_hash, log_preview, fixture_id,
      provider, brain, likely_cause, summary, confidence,
      needs_human_review, rag_weak, diagnosis_json, meta_json
    ) VALUES (
      @id, @userId, @createdAt, @logHash, @logPreview, @fixtureId,
      @provider, @brain, @likelyCause, @summary, @confidence,
      @needsHumanReview, @ragWeak, @diagnosisJson, @metaJson
    )
  `);

  const insertFts = db.prepare(`
    INSERT INTO diagnosis_fts (run_id, likely_cause, summary, log_preview)
    VALUES (@runId, @likelyCause, @summary, @logPreview)
  `);

  const tx = db.transaction(() => {
    insertRun.run({
      id,
      userId: input.userId,
      createdAt,
      logHash,
      logPreview,
      fixtureId: input.fixtureId ?? null,
      provider: diagnosis.provider,
      brain: meta.brain,
      likelyCause: diagnosis.likelyCause,
      summary: diagnosis.summary,
      confidence: diagnosis.confidence,
      needsHumanReview: diagnosis.needsHumanReview ? 1 : 0,
      ragWeak: meta.ragWeak ? 1 : 0,
      diagnosisJson: JSON.stringify(diagnosis),
      metaJson: JSON.stringify(meta),
    });
    insertFts.run({
      runId: id,
      likelyCause: diagnosis.likelyCause,
      summary: diagnosis.summary,
      logPreview,
    });
  });
  tx();
  return id;
}

async function saveDiagnosisRunPg(input: {
  userId: string;
  logText: string;
  fixtureId?: string | null;
  response: DiagnoseResponse;
}): Promise<string> {
  const pool = getPool();
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const logHash = hashLog(input.logText);
  const logPreview = input.logText.trim().slice(0, 240);
  const { diagnosis, meta } = input.response;

  await pool.query(
    `
    INSERT INTO diagnosis_runs (
      id, user_id, created_at, log_hash, log_preview, fixture_id,
      provider, brain, likely_cause, summary, confidence,
      needs_human_review, rag_weak, diagnosis_json, meta_json
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13, $14, $15
    )
  `,
    [
      id,
      input.userId,
      createdAt,
      logHash,
      logPreview,
      input.fixtureId ?? null,
      diagnosis.provider,
      meta.brain,
      diagnosis.likelyCause,
      diagnosis.summary,
      diagnosis.confidence,
      diagnosis.needsHumanReview,
      meta.ragWeak,
      JSON.stringify(diagnosis),
      JSON.stringify(meta),
    ],
  );
  return id;
}

export async function listHistory(
  userId: string,
  opts: { q?: string; limit?: number } = {},
): Promise<HistoryListItem[]> {
  if (usePostgres()) return listHistoryPg(userId, opts);
  return listHistorySqlite(userId, opts);
}

function listHistorySqlite(
  userId: string,
  opts: { q?: string; limit?: number },
): HistoryListItem[] {
  const db = getSqliteDb();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const q = opts.q?.trim();

  if (q) {
    try {
      const tokens = q
        .split(/\s+/)
        .map((t) => t.replace(/["*]/g, "").trim())
        .filter(Boolean);
      if (tokens.length > 0) {
        const match = tokens.map((t) => `"${t}"*`).join(" OR ");
        const rows = db
          .prepare(
            `
          SELECT r.*
          FROM diagnosis_fts f
          JOIN diagnosis_runs r ON r.id = f.run_id
          WHERE diagnosis_fts MATCH ?
            AND r.user_id = ?
          ORDER BY r.created_at DESC
          LIMIT ?
        `,
          )
          .all(match, userId, limit) as Record<string, unknown>[];
        return rows.map(rowToListItem);
      }
    } catch {
      // FTS parse → LIKE
    }
    const like = `%${q.replace(/%/g, "")}%`;
    const rows = db
      .prepare(
        `
      SELECT * FROM diagnosis_runs
      WHERE user_id = ?
        AND (
          likely_cause LIKE ? OR summary LIKE ? OR log_preview LIKE ?
        )
      ORDER BY created_at DESC
      LIMIT ?
    `,
      )
      .all(userId, like, like, like, limit) as Record<string, unknown>[];
    return rows.map(rowToListItem);
  }

  const rows = db
    .prepare(
      `
    SELECT * FROM diagnosis_runs
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `,
    )
    .all(userId, limit) as Record<string, unknown>[];
  return rows.map(rowToListItem);
}

async function listHistoryPg(
  userId: string,
  opts: { q?: string; limit?: number },
): Promise<HistoryListItem[]> {
  const pool = getPool();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const q = opts.q?.trim();

  if (q) {
    const res = await pool.query(
      `
      SELECT *
      FROM diagnosis_runs
      WHERE user_id = $1
        AND (
          to_tsvector(
            'english',
            coalesce(likely_cause, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(log_preview, '')
          ) @@ plainto_tsquery('english', $2)
          OR likely_cause ILIKE $3
          OR summary ILIKE $3
          OR log_preview ILIKE $3
        )
      ORDER BY created_at DESC
      LIMIT $4
    `,
      [userId, q, `%${q.replace(/%/g, "")}%`, limit],
    );
    return res.rows.map((r) => rowToListItem(r as Record<string, unknown>));
  }

  const res = await pool.query(
    `
    SELECT * FROM diagnosis_runs
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `,
    [userId, limit],
  );
  return res.rows.map((r) => rowToListItem(r as Record<string, unknown>));
}

export async function getHistoryDetail(
  userId: string,
  id: string,
): Promise<HistoryDetail | null> {
  if (usePostgres()) {
    const res = await getPool().query(
      `SELECT * FROM diagnosis_runs WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    const feedback = await getFeedback(userId, id);
    return {
      ...rowToListItem(row),
      logHash: String(row.log_hash),
      diagnosis: JSON.parse(String(row.diagnosis_json)) as Diagnosis,
      meta: JSON.parse(String(row.meta_json)) as DiagnoseResponse["meta"],
      feedback,
    };
  }

  const row = getSqliteDb()
    .prepare(`SELECT * FROM diagnosis_runs WHERE id = ? AND user_id = ?`)
    .get(id, userId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const feedback = await getFeedback(userId, id);
  return {
    ...rowToListItem(row),
    logHash: String(row.log_hash),
    diagnosis: JSON.parse(String(row.diagnosis_json)) as Diagnosis,
    meta: JSON.parse(String(row.meta_json)) as DiagnoseResponse["meta"],
    feedback,
  };
}

export async function getInsights(userId: string): Promise<Insights> {
  if (usePostgres()) return getInsightsPg(userId);
  return getInsightsSqlite(userId);
}

function getInsightsSqlite(userId: string): Insights {
  const db = getSqliteDb();
  const totals = db
    .prepare(
      `
    SELECT
      COUNT(*) AS total,
      SUM(needs_human_review) AS review_n,
      SUM(rag_weak) AS rag_weak_n
    FROM diagnosis_runs
    WHERE user_id = ?
  `,
    )
    .get(userId) as {
    total: number;
    review_n: number | null;
    rag_weak_n: number | null;
  };

  const totalRuns = Number(totals.total ?? 0);
  const needsReviewCount = Number(totals.review_n ?? 0);
  const ragWeakCount = Number(totals.rag_weak_n ?? 0);

  const byProvider = (
    db
      .prepare(
        `
    SELECT provider, COUNT(*) AS count
    FROM diagnosis_runs WHERE user_id = ?
    GROUP BY provider ORDER BY count DESC
  `,
      )
      .all(userId) as { provider: string; count: number }[]
  ).map((r) => ({ provider: r.provider, count: Number(r.count) }));

  const byBrain = (
    db
      .prepare(
        `
    SELECT brain, COUNT(*) AS count
    FROM diagnosis_runs WHERE user_id = ?
    GROUP BY brain ORDER BY count DESC
  `,
      )
      .all(userId) as { brain: string; count: number }[]
  ).map((r) => ({ brain: r.brain, count: Number(r.count) }));

  const byConfidence = (
    db
      .prepare(
        `
    SELECT confidence, COUNT(*) AS count
    FROM diagnosis_runs WHERE user_id = ?
    GROUP BY confidence ORDER BY count DESC
  `,
      )
      .all(userId) as { confidence: string; count: number }[]
  ).map((r) => ({ confidence: r.confidence, count: Number(r.count) }));

  const topCauses = (
    db
      .prepare(
        `
    SELECT likely_cause AS cause, COUNT(*) AS count
    FROM diagnosis_runs WHERE user_id = ?
    GROUP BY likely_cause
    ORDER BY count DESC
    LIMIT 8
  `,
      )
      .all(userId) as { cause: string; count: number }[]
  ).map((r) => ({ cause: r.cause, count: Number(r.count) }));

  return {
    totalRuns,
    needsReviewCount,
    needsReviewRate: totalRuns === 0 ? 0 : needsReviewCount / totalRuns,
    ragWeakCount,
    byProvider,
    byBrain,
    byConfidence,
    topCauses,
    costEstimate: estimateDiagnoseCost(byProvider),
  };
}

async function getInsightsPg(userId: string): Promise<Insights> {
  const pool = getPool();
  const totalsRes = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total,
      COALESCE(SUM(needs_human_review::int), 0)::int AS review_n,
      COALESCE(SUM(rag_weak::int), 0)::int AS rag_weak_n
    FROM diagnosis_runs
    WHERE user_id = $1
  `,
    [userId],
  );
  const totals = totalsRes.rows[0] as {
    total: number;
    review_n: number;
    rag_weak_n: number;
  };
  const totalRuns = Number(totals.total ?? 0);
  const needsReviewCount = Number(totals.review_n ?? 0);
  const ragWeakCount = Number(totals.rag_weak_n ?? 0);

  const mapCount = async (sql: string) => {
    const res = await pool.query(sql, [userId]);
    return res.rows.map((r) => ({
      ...(r as object),
      count: Number((r as { count: number }).count),
    }));
  };

  const byProvider = (await mapCount(`
    SELECT provider, COUNT(*)::int AS count
    FROM diagnosis_runs WHERE user_id = $1
    GROUP BY provider ORDER BY count DESC
  `)) as { provider: string; count: number }[];

  const byBrain = (await mapCount(`
    SELECT brain, COUNT(*)::int AS count
    FROM diagnosis_runs WHERE user_id = $1
    GROUP BY brain ORDER BY count DESC
  `)) as { brain: string; count: number }[];

  const byConfidence = (await mapCount(`
    SELECT confidence, COUNT(*)::int AS count
    FROM diagnosis_runs WHERE user_id = $1
    GROUP BY confidence ORDER BY count DESC
  `)) as { confidence: string; count: number }[];

  const topRes = await pool.query(
    `
    SELECT likely_cause AS cause, COUNT(*)::int AS count
    FROM diagnosis_runs WHERE user_id = $1
    GROUP BY likely_cause
    ORDER BY count DESC
    LIMIT 8
  `,
    [userId],
  );
  const topCauses = topRes.rows.map((r) => ({
    cause: String((r as { cause: string }).cause),
    count: Number((r as { count: number }).count),
  }));

  return {
    totalRuns,
    needsReviewCount,
    needsReviewRate: totalRuns === 0 ? 0 : needsReviewCount / totalRuns,
    ragWeakCount,
    byProvider,
    byBrain,
    byConfidence,
    topCauses,
    costEstimate: estimateDiagnoseCost(byProvider),
  };
}

/**
 * A3c — Human feedback: thumbs on a saved run; downs feed eval candidates.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getSqliteDb, usePostgres } from "../db/client.js";
import { getPool } from "../db/postgres.js";
import type { Diagnosis } from "./types.js";
import { log } from "./logger.js";

export type FeedbackRating = "up" | "down";

export type FeedbackRecord = {
  runId: string;
  rating: FeedbackRating;
  note: string | null;
  updatedAt: string;
};

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export function feedbackCandidatesPath(): string {
  const override = process.env.FEEDBACK_CANDIDATES_PATH?.trim();
  if (override) return override;
  return path.join(serverRoot, "evals", "feedback-candidates.jsonl");
}

type RunRow = {
  id: string;
  fixture_id: string | null;
  log_preview: string;
  provider: string;
  brain: string;
  rag_weak: number | boolean;
  needs_human_review: number | boolean;
  diagnosis_json: string;
};

async function loadRunForUser(
  userId: string,
  runId: string,
): Promise<RunRow | null> {
  if (usePostgres()) {
    const res = await getPool().query(
      `SELECT id, fixture_id, log_preview, provider, brain, rag_weak,
              needs_human_review, diagnosis_json
       FROM diagnosis_runs WHERE id = $1 AND user_id = $2`,
      [runId, userId],
    );
    return (res.rows[0] as RunRow | undefined) ?? null;
  }
  return (
    (getSqliteDb()
      .prepare(
        `SELECT id, fixture_id, log_preview, provider, brain, rag_weak,
                needs_human_review, diagnosis_json
         FROM diagnosis_runs WHERE id = ? AND user_id = ?`,
      )
      .get(runId, userId) as RunRow | undefined) ?? null
  );
}

export async function getFeedback(
  userId: string,
  runId: string,
): Promise<FeedbackRecord | null> {
  if (usePostgres()) {
    const res = await getPool().query(
      `SELECT run_id, rating, note, updated_at
       FROM diagnosis_feedback WHERE run_id = $1 AND user_id = $2`,
      [runId, userId],
    );
    const row = res.rows[0] as
      | {
          run_id: string;
          rating: string;
          note: string | null;
          updated_at: Date | string;
        }
      | undefined;
    if (!row) return null;
    return {
      runId: row.run_id,
      rating: row.rating as FeedbackRating,
      note: row.note,
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : String(row.updated_at),
    };
  }

  const row = getSqliteDb()
    .prepare(
      `SELECT run_id, rating, note, updated_at
       FROM diagnosis_feedback WHERE run_id = ? AND user_id = ?`,
    )
    .get(runId, userId) as
    | { run_id: string; rating: string; note: string | null; updated_at: string }
    | undefined;
  if (!row) return null;
  return {
    runId: row.run_id,
    rating: row.rating as FeedbackRating,
    note: row.note,
    updatedAt: row.updated_at,
  };
}

export async function saveFeedback(input: {
  userId: string;
  runId: string;
  rating: FeedbackRating;
  note?: string | null;
}): Promise<FeedbackRecord> {
  const run = await loadRunForUser(input.userId, input.runId);
  if (!run) {
    throw Object.assign(new Error("run not found"), { status: 404 });
  }

  const now = new Date().toISOString();
  const note = input.note?.trim() ? input.note.trim().slice(0, 500) : null;

  if (usePostgres()) {
    await getPool().query(
      `
      INSERT INTO diagnosis_feedback (run_id, user_id, rating, note, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (run_id) DO UPDATE SET
        rating = EXCLUDED.rating,
        note = EXCLUDED.note,
        updated_at = NOW()
      `,
      [input.runId, input.userId, input.rating, note],
    );
  } else {
    getSqliteDb()
      .prepare(
        `
      INSERT INTO diagnosis_feedback (run_id, user_id, rating, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO UPDATE SET
        rating = excluded.rating,
        note = excluded.note,
        updated_at = excluded.updated_at
    `,
      )
      .run(input.runId, input.userId, input.rating, note, now, now);
  }

  if (input.rating === "down") {
    let diagnosis: Diagnosis | Record<string, unknown> = {};
    try {
      diagnosis = JSON.parse(run.diagnosis_json) as Diagnosis;
    } catch {
      diagnosis = {};
    }
    appendEvalCandidate({
      at: now,
      runId: input.runId,
      userId: input.userId,
      note,
      fixtureId: run.fixture_id,
      logPreview: run.log_preview,
      diagnosis,
      meta: {
        provider: run.provider,
        brain: run.brain,
        ragWeak: Boolean(run.rag_weak),
        needsHumanReview: Boolean(run.needs_human_review),
      },
      promoteHint:
        "Review this miss; add a golden to server/evals/goldens.json when ready (do not auto-merge).",
    });
  }

  log("info", "feedback_saved", {
    runId: input.runId,
    rating: input.rating,
    fedToEvalCandidates: input.rating === "down",
  });

  return {
    runId: input.runId,
    rating: input.rating,
    note,
    updatedAt: now,
  };
}

function appendEvalCandidate(row: Record<string, unknown>): void {
  const file = feedbackCandidatesPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`, "utf8");
}

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { closeDb, initDb } from "../src/db/client.js";
import {
  feedbackCandidatesPath,
  saveFeedback,
} from "../src/lib/feedback.js";
import { saveDiagnosisRun } from "../src/lib/history.js";
import type { DiagnoseResponse } from "../src/lib/types.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "loglens-fb-"));
const dbFile = path.join(tmpDir, "test.db");
const candidatesFile = path.join(tmpDir, "feedback-candidates.jsonl");

const sample: DiagnoseResponse = {
  diagnosis: {
    provider: "mock",
    summary: "Unit test assertion failed",
    likelyCause: "Failing assertion in unit tests",
    evidence: ["runbook:assertion-failures.md"],
    nextSteps: ["Diff the commit"],
    confidence: "high",
    needsHumanReview: true,
  },
  meta: {
    logChars: 40,
    fixtureHint: "failing-test",
    mode: "mock",
    fellBackToMock: false,
    fallbackReason: null,
    model: null,
    latencyMs: 5,
    truncated: false,
    truncateStrategy: "none",
    keptErrorLines: 0,
    injectionSuspected: false,
    injectionSignals: [],
    ragChunkCount: 4,
    ragHitCount: 1,
    ragTopScore: 0.5,
    ragWeak: false,
    ragSources: ["assertion-failures.md"],
    brain: "node-local",
  },
};

before(async () => {
  delete process.env.DATABASE_URL;
  process.env.SQLITE_PATH = dbFile;
  process.env.FEEDBACK_CANDIDATES_PATH = candidatesFile;
  await closeDb();
  await initDb();
});

after(async () => {
  await closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.SQLITE_PATH;
  delete process.env.FEEDBACK_CANDIDATES_PATH;
});

test("thumbs down appends eval candidate", async () => {
  const userId = `fb-${Date.now()}`;
  const runId = await saveDiagnosisRun({
    userId,
    logText: "FAIL AssertionError expected 1 to equal 2",
    fixtureId: "failing-test",
    response: sample,
  });

  const fb = await saveFeedback({
    userId,
    runId,
    rating: "down",
    note: "wrong cause",
  });
  assert.equal(fb.rating, "down");

  const file = feedbackCandidatesPath();
  assert.equal(file, candidatesFile);
  assert.ok(fs.existsSync(file));
  const last = fs.readFileSync(file, "utf8").trim().split("\n").pop()!;
  const row = JSON.parse(last) as { runId: string; promoteHint: string };
  assert.equal(row.runId, runId);
  assert.match(row.promoteHint, /goldens/i);

  const up = await saveFeedback({ userId, runId, rating: "up" });
  assert.equal(up.rating, "up");
});

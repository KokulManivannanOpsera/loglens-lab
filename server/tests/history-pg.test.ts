/**
 * D7 — Postgres history path (skipped unless DATABASE_URL is set).
 * CI: LogLens CI job "Node — postgres history" starts a service container.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, getDbInfo, initDb, usePostgres } from "../src/db/client.js";
import {
  getHistoryDetail,
  getInsights,
  listHistory,
  saveDiagnosisRun,
} from "../src/lib/history.js";
import type { DiagnoseResponse } from "../src/lib/types.js";

const sample: DiagnoseResponse = {
  diagnosis: {
    provider: "mock",
    summary: "pg path",
    likelyCause: "Postgres connection timeout",
    evidence: [],
    nextSteps: ["Check DATABASE_URL"],
    confidence: "high",
    needsHumanReview: false,
  },
  meta: {
    logChars: 10,
    fixtureHint: null,
    mode: "mock",
    fellBackToMock: false,
    fallbackReason: null,
    model: null,
    latencyMs: 1,
    truncated: false,
    truncateStrategy: "none",
    keptErrorLines: 0,
    injectionSuspected: false,
    injectionSignals: [],
    ragChunkCount: 0,
    ragHitCount: 0,
    ragTopScore: 0,
    ragWeak: true,
    ragSources: [],
    brain: "node-local",
  },
};

const enabled = Boolean(process.env.DATABASE_URL?.trim());

before(async () => {
  if (!enabled) return;
  delete process.env.SQLITE_PATH;
  await closeDb();
  await initDb();
});

after(async () => {
  if (!enabled) return;
  await closeDb();
});

test("postgres engine selected when DATABASE_URL set", { skip: !enabled }, () => {
  assert.equal(usePostgres(), true);
  assert.equal(getDbInfo().engine, "postgres");
});

test("postgres save + search + insights", { skip: !enabled }, async () => {
  const userId = `pg-user-${Date.now()}`;
  const id = await saveDiagnosisRun({
    userId,
    logText: "ERROR connection timeout to db",
    response: sample,
  });
  const items = await listHistory(userId, { q: "timeout" });
  assert.ok(items.some((i) => i.id === id));
  const detail = await getHistoryDetail(userId, id);
  assert.ok(detail);
  assert.equal(detail.diagnosis.likelyCause, sample.diagnosis.likelyCause);
  const insights = await getInsights(userId);
  assert.ok(insights.totalRuns >= 1);
});

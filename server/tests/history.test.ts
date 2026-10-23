import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { closeDb, initDb } from "../src/db/client.js";
import { cacheClear, cacheGet, cacheSet } from "../src/lib/diagCache.js";
import {
  getHistoryDetail,
  getInsights,
  hashLog,
  listHistory,
  saveDiagnosisRun,
} from "../src/lib/history.js";
import type { DiagnoseResponse } from "../src/lib/types.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "loglens-history-"));
const dbFile = path.join(tmpDir, "test.db");

const sample: DiagnoseResponse = {
  diagnosis: {
    provider: "mock",
    summary: "Assertion failed in suite",
    likelyCause: "AssertionError in unit test",
    evidence: ["runbook:assertion-failures.md"],
    nextSteps: ["Re-run the failing test locally"],
    confidence: "medium",
    needsHumanReview: true,
  },
  meta: {
    logChars: 120,
    fixtureHint: "failing-test",
    mode: "mock",
    fellBackToMock: false,
    fallbackReason: null,
    model: null,
    latencyMs: 12,
    truncated: false,
    truncateStrategy: "none",
    keptErrorLines: 0,
    injectionSuspected: false,
    injectionSignals: [],
    ragChunkCount: 3,
    ragHitCount: 1,
    ragTopScore: 2,
    ragWeak: false,
    ragSources: ["assertion-failures.md"],
    brain: "node-local",
  },
};

before(async () => {
  delete process.env.DATABASE_URL;
  process.env.SQLITE_PATH = dbFile;
  await closeDb();
  await initDb();
  cacheClear();
});

after(async () => {
  await closeDb();
  cacheClear();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.SQLITE_PATH;
});

test("hashLog is stable", () => {
  assert.equal(hashLog("abc"), hashLog("abc"));
  assert.notEqual(hashLog("abc"), hashLog("abd"));
});

test("save + list + detail + insights", async () => {
  const userId = "user-1";
  const id = await saveDiagnosisRun({
    userId,
    logText: "FAIL AssertionError: expected true",
    fixtureId: "failing-test",
    response: sample,
  });
  assert.ok(id);

  const items = await listHistory(userId);
  assert.equal(items.length, 1);
  assert.equal(items[0].likelyCause, sample.diagnosis.likelyCause);

  const detail = await getHistoryDetail(userId, id);
  assert.ok(detail);
  assert.equal(detail.diagnosis.provider, "mock");

  const other = await listHistory("other-user");
  assert.equal(other.length, 0);

  const insights = await getInsights(userId);
  assert.equal(insights.totalRuns, 1);
  assert.equal(insights.needsReviewCount, 1);
  assert.ok(insights.byProvider.some((p) => p.provider === "mock"));
  assert.ok(insights.costEstimate);
  assert.equal(insights.costEstimate.mockRuns, 1);
  assert.equal(insights.costEstimate.openaiRuns, 0);
  assert.equal(insights.costEstimate.estimatedUsd, 0);
});

test("search finds by cause keyword", async () => {
  const userId = "user-search";
  await saveDiagnosisRun({
    userId,
    logText: "timeout waiting for response",
    response: {
      ...sample,
      diagnosis: {
        ...sample.diagnosis,
        likelyCause: "HTTP timeout to upstream",
        summary: "Request hung",
      },
    },
  });
  const hits = await listHistory(userId, { q: "timeout" });
  assert.ok(hits.length >= 1);
  assert.match(hits[0].likelyCause, /timeout/i);
});

test("diagCache round-trip", () => {
  const runId = "run-x";
  cacheSet("u", "hash1", runId, sample);
  const hit = cacheGet("u", "hash1");
  assert.ok(hit);
  assert.equal(hit.runId, runId);
  assert.equal(cacheGet("u", "missing"), null);
});

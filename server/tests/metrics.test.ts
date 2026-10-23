import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getMetricsSnapshot,
  observeDiagnose,
  observeHttp,
  resetMetrics,
} from "../src/lib/metrics.js";

test("metrics accumulate http + diagnose ungrounded rate", () => {
  resetMetrics();
  observeHttp("GET", "/api/health", 200);
  observeHttp("POST", "/api/diagnose", 200);
  observeDiagnose({
    ok: true,
    latencyMs: 40,
    ragWeak: true,
    needsHumanReview: true,
  });
  observeDiagnose({
    ok: true,
    latencyMs: 20,
    ragWeak: false,
    needsHumanReview: false,
  });
  const snap = getMetricsSnapshot();
  assert.equal(snap.diagnose.total, 2);
  assert.equal(snap.diagnose.ungrounded, 1);
  assert.equal(snap.diagnose.ungroundedRate, 0.5);
  assert.equal(snap.diagnose.latencyMs.avg, 30);
  assert.ok(snap.httpRequestsTotal.some((r) => r.route === "/api/diagnose"));
  resetMetrics();
});

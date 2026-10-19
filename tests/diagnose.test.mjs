import assert from "node:assert/strict";
import test from "node:test";

const BASE = "http://127.0.0.1:8091";

test("health and mock diagnose on failing-test fixture", async (t) => {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    t.skip("start the app: npm run dev");
    return;
  }

  const h = await health.json();
  assert.equal(h.status, "ok");

  const fix = await fetch(`${BASE}/api/fixtures/failing-test`);
  assert.equal(fix.status, 200);
  const { text } = await fix.json();

  const res = await fetch(`${BASE}/api/diagnose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logText: text, fixtureId: "failing-test", mode: "mock" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.diagnosis.provider, "mock");
  assert.equal(body.diagnosis.confidence, "high");
  assert.ok(body.diagnosis.evidence.length > 0);
  assert.equal(body.meta.mode, "mock");
  assert.equal(typeof body.meta.latencyMs, "number");
});

test("missing logs fixture forces human review", async (t) => {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    t.skip("app not running");
    return;
  }

  const fix = await fetch(`${BASE}/api/fixtures/missing-logs`);
  const { text } = await fix.json();
  const res = await fetch(`${BASE}/api/diagnose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logText: text, mode: "mock" }),
  });
  const { diagnosis } = await res.json();
  assert.equal(diagnosis.needsHumanReview, true);
  assert.match(diagnosis.likelyCause, /artifact|404|unavailable/i);
});

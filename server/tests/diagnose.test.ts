import assert from "node:assert/strict";
import test from "node:test";

const BASE = process.env.API_URL || "http://127.0.0.1:8091";

test("health and mock diagnose on failing-test fixture", async (t) => {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    t.skip("start API: npm run dev --workspace=server");
    return;
  }

  assert.equal((await health.json()).status, "ok");

  const fix = await fetch(`${BASE}/api/fixtures/failing-test`);
  assert.equal(fix.status, 200);
  const { text } = (await fix.json()) as { text: string };

  const res = await fetch(`${BASE}/api/diagnose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logText: text, fixtureId: "failing-test", mode: "mock" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    diagnosis: { provider: string; confidence: string; evidence: string[] };
    meta: { mode: string; latencyMs: number };
  };
  assert.equal(body.diagnosis.provider, "mock");
  assert.equal(body.diagnosis.confidence, "high");
  assert.ok(body.diagnosis.evidence.length > 0);
  assert.equal(body.meta.mode, "mock");
});

test("missing logs fixture forces human review", async (t) => {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    t.skip("API not running");
    return;
  }

  const fix = await fetch(`${BASE}/api/fixtures/missing-logs`);
  const { text } = (await fix.json()) as { text: string };
  const res = await fetch(`${BASE}/api/diagnose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logText: text, mode: "mock" }),
  });
  const { diagnosis } = (await res.json()) as {
    diagnosis: { needsHumanReview: boolean; likelyCause: string };
  };
  assert.equal(diagnosis.needsHumanReview, true);
  assert.match(diagnosis.likelyCause, /artifact|404|unavailable/i);
});

import assert from "node:assert/strict";
import test from "node:test";

const BASE = process.env.API_URL || "http://127.0.0.1:8091";

async function signupCookie(): Promise<string> {
  const email = `lab-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  assert.equal(res.status, 201, await res.text());
  const cookies = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [];
  const raw = cookies.find((c) => c.startsWith("loglens_session="));
  assert.ok(raw, "expected session cookie from signup");
  return raw.split(";")[0];
}

test("health and mock diagnose on failing-test fixture", async (t) => {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    t.skip("start API: npm run dev --workspace=server");
    return;
  }

  assert.equal((await health.json()).status, "ok");
  const cookie = await signupCookie();

  const fix = await fetch(`${BASE}/api/fixtures/failing-test`, {
    headers: { Cookie: cookie },
  });
  assert.equal(fix.status, 200);
  const { text } = (await fix.json()) as { text: string };

  const res = await fetch(`${BASE}/api/diagnose`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
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

  const cookie = await signupCookie();
  const fix = await fetch(`${BASE}/api/fixtures/missing-logs`, {
    headers: { Cookie: cookie },
  });
  const { text } = (await fix.json()) as { text: string };
  const res = await fetch(`${BASE}/api/diagnose`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ logText: text, mode: "mock" }),
  });
  const { diagnosis } = (await res.json()) as {
    diagnosis: { needsHumanReview: boolean; likelyCause: string };
  };
  assert.equal(diagnosis.needsHumanReview, true);
  assert.match(diagnosis.likelyCause, /artifact|404|unavailable/i);
});

test("prompt-injection fixture forces HITL meta", async (t) => {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    t.skip("API not running");
    return;
  }

  const cookie = await signupCookie();
  const fix = await fetch(`${BASE}/api/fixtures/prompt-injection`, {
    headers: { Cookie: cookie },
  });
  assert.equal(fix.status, 200);
  const { text } = (await fix.json()) as { text: string };

  const res = await fetch(`${BASE}/api/diagnose`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({
      logText: text,
      fixtureId: "prompt-injection",
      mode: "mock",
    }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    diagnosis: { needsHumanReview: boolean; summary: string };
    meta: { injectionSuspected: boolean; injectionSignals: string[] };
  };
  assert.equal(body.meta.injectionSuspected, true);
  assert.ok(body.meta.injectionSignals.length > 0);
  assert.equal(body.diagnosis.needsHumanReview, true);
  assert.match(body.diagnosis.summary, /untrusted|injection/i);
});

test("diagnose without cookie is 401", async (t) => {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    t.skip("API not running");
    return;
  }
  const res = await fetch(`${BASE}/api/diagnose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logText: "x", mode: "mock" }),
  });
  assert.equal(res.status, 401);
});

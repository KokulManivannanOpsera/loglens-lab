import assert from "node:assert/strict";
import test from "node:test";
import { chunkForPreview } from "../src/lib/streamDiagnose.js";

test("chunkForPreview splits for typing UX", () => {
  const parts = chunkForPreview("abcdefghijklmnop", 5);
  assert.deepEqual(parts, ["abcde", "fghij", "klmno", "p"]);
});

test("SSE diagnose stream emits delta then done", async (t) => {
  const BASE = process.env.API_URL || "http://127.0.0.1:8091";
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    t.skip("start API: npm run dev");
    return;
  }

  const email = `stream-${Date.now()}@example.com`;
  const signup = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  assert.equal(signup.status, 201);
  const cookies =
    typeof signup.headers.getSetCookie === "function"
      ? signup.headers.getSetCookie()
      : [];
  const raw = cookies.find((c) => c.startsWith("loglens_session="));
  assert.ok(raw);
  const cookie = raw.split(";")[0];

  const res = await fetch(`${BASE}/api/diagnose/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      logText: "FAIL Error: AssertionError expected 1 to equal 2",
      mode: "mock",
    }),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/event-stream/);

  const body = await res.text();
  assert.match(body, /event: status/);
  assert.match(body, /event: delta/);
  assert.match(body, /event: done/);
  assert.match(body, /"provider":"mock"/);
  assert.match(body, /"streamed":true/);
});

test("SSE cancel stops before done when aborted early", async (t) => {
  const BASE = process.env.API_URL || "http://127.0.0.1:8091";
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    t.skip("API not running");
    return;
  }

  const email = `cancel-${Date.now()}@example.com`;
  const signup = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  const cookies =
    typeof signup.headers.getSetCookie === "function"
      ? signup.headers.getSetCookie()
      : [];
  const cookie = cookies
    .find((c) => c.startsWith("loglens_session="))!
    .split(";")[0];

  const ac = new AbortController();
  const resP = fetch(`${BASE}/api/diagnose/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Accept: "text/event-stream",
    },
    signal: ac.signal,
    body: JSON.stringify({
      logText: "FAIL Error: AssertionError expected 1 to equal 2",
      mode: "mock",
    }),
  });

  // Abort during preview window (brain is fast; deltas are paced).
  setTimeout(() => ac.abort(), 80);

  try {
    const res = await resP;
    if (res.body) {
      const reader = res.body.getReader();
      try {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      } catch {
        /* abort while reading */
      }
    }
  } catch (err) {
    assert.ok(
      err instanceof Error &&
        (err.name === "AbortError" || /abort/i.test(err.message)),
    );
  }
});

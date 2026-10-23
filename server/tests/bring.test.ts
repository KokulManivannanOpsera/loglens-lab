import assert from "node:assert/strict";
import test from "node:test";
import { estimateDiagnoseCost } from "../src/lib/costEstimate.js";
import { isSlackConfigured } from "../src/lib/slackNotify.js";

test("costEstimate: mock free, openai priced", () => {
  const est = estimateDiagnoseCost([
    { provider: "mock", count: 10 },
    { provider: "openai", count: 2 },
  ]);
  assert.equal(est.mockRuns, 10);
  assert.equal(est.openaiRuns, 2);
  assert.equal(est.currency, "USD");
  assert.ok(est.estimatedUsd > 0);
  assert.match(est.note, /Proxy/i);
});

test("slack is no-op when webhook unset", () => {
  const prev = process.env.SLACK_WEBHOOK_URL;
  delete process.env.SLACK_WEBHOOK_URL;
  assert.equal(isSlackConfigured(), false);
  if (prev !== undefined) process.env.SLACK_WEBHOOK_URL = prev;
});

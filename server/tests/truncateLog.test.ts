import assert from "node:assert/strict";
import test from "node:test";
import { MAX_LOG_CHARS, truncateLog } from "../src/lib/truncateLog.ts";

function padBlock(label: string, size: number): string {
  const unit = `[${label}] lorem ipsum noise `;
  return unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
}

test("short logs pass through unchanged", () => {
  const log = "ok\nAssertionError: boom\n";
  const result = truncateLog(log);
  assert.equal(result.truncated, false);
  assert.equal(result.strategy, "none");
  assert.equal(result.text, log.trim());
});

test("error-aware keeps AssertionError buried in the middle", () => {
  const marker = "AssertionError: expected 1 to equal 2 — UNIQUE_FAIL_MARKER";
  // Place failure where naive head(4k)+tail(7k) on a 20k+ log would drop it.
  const log = [
    padBlock("HEAD", 5_000),
    marker,
    padBlock("MID", 8_000),
    padBlock("TAIL", 8_000),
  ].join("\n");

  assert.ok(log.length > MAX_LOG_CHARS);

  const naiveHead = log.slice(0, 4_000);
  const naiveTail = log.slice(-7_000);
  assert.ok(
    !naiveHead.includes("UNIQUE_FAIL_MARKER") && !naiveTail.includes("UNIQUE_FAIL_MARKER"),
    "precondition: naive head+tail must miss the marker",
  );

  const result = truncateLog(log);
  assert.equal(result.truncated, true);
  assert.equal(result.strategy, "error-aware");
  assert.ok(result.keptErrorLines > 0);
  assert.match(result.text, /UNIQUE_FAIL_MARKER/);
  assert.ok(result.text.length <= MAX_LOG_CHARS + 120);
});

test("head-tail fallback when no error patterns", () => {
  const log = padBlock("ONLY_NOISE", MAX_LOG_CHARS + 4_000);
  const result = truncateLog(log);
  assert.equal(result.truncated, true);
  assert.equal(result.strategy, "head-tail");
  assert.equal(result.keptErrorLines, 0);
  assert.match(result.text, /truncated middle for context window/);
});

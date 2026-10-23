import type { Diagnosis } from "./types.js";

/**
 * A0 mock "model": rule-based, no API key.
 * Later we swap this for a real LLM while keeping the same Diagnosis shape.
 */
export function mockDiagnose(logText: string): Diagnosis {
  const log = logText.trim();
  if (!log) {
    return {
      provider: "mock",
      summary: "No log text provided.",
      likelyCause: "Empty input",
      evidence: [],
      nextSteps: ["Paste a CI log or load a fixture."],
      confidence: "low",
      needsHumanReview: true,
    };
  }

  if (/log artifact not found|404|Skipping log download/i.test(log)) {
    return {
      provider: "mock",
      summary: "CI run exists but log content is missing.",
      likelyCause: "Log artifact unavailable (404 / download skipped)",
      evidence: extractLines(log, [/404/i, /not found/i, /Skipping log/i]),
      nextSteps: [
        "Re-fetch the workflow artifacts",
        "Do not invent a failing test name",
        "Escalate if artifacts stay missing",
      ],
      confidence: "high",
      needsHumanReview: true,
    };
  }

  if (/flaky|ETIMEDOUT|Timeout of \d+ms exceeded/i.test(log)) {
    return {
      provider: "mock",
      summary: "Failure looks like a timeout / flake, not a clear logic bug.",
      likelyCause: "Flaky or network-timeout test",
      evidence: extractLines(log, [/flaky/i, /ETIMEDOUT/i, /Timeout/i]),
      nextSteps: [
        "Check if the test is marked flaky in the KB",
        "Re-run once before deep debugging",
        "Capture whether production traffic shows the same timeout",
      ],
      confidence: "medium",
      needsHumanReview: true,
    };
  }

  if (/AssertionError|expected .+ to equal|FAILING|\d+ failing/i.test(log)) {
    return {
      provider: "mock",
      summary: "Unit test assertion failed; related commit may explain the change.",
      likelyCause: "Failing assertion in unit tests",
      evidence: extractLines(log, [/AssertionError/i, /expected/i, /Related commit/i, /failing/i]),
      nextSteps: [
        "Open the failing test file from the stack trace",
        "Diff the related commit against the assertion",
        "Draft a PR comment only after human approve (not in A0)",
      ],
      confidence: "high",
      needsHumanReview: false,
    };
  }

  return {
    provider: "mock",
    summary: "No strong pattern matched; refuse to guess a root cause.",
    likelyCause: "Unknown — insufficient signal",
    evidence: log.split("\n").filter(Boolean).slice(0, 3),
    nextSteps: [
      "Add more log context",
      "Try a fixture with a clearer failure",
      "Check whether runbook retrieval returned useful chunks (A2)",
    ],
    confidence: "low",
    needsHumanReview: true,
  };
}

function extractLines(log: string, patterns: RegExp[]): string[] {
  const lines = log.split("\n").map((l) => l.trim()).filter(Boolean);
  const hits = lines.filter((line) => patterns.some((p) => p.test(line)));
  return (hits.length ? hits : lines.slice(0, 3)).slice(0, 5);
}

import assert from "node:assert/strict";
import test from "node:test";
import { getOllamaBaseUrl, getOllamaModel } from "../src/lib/ollamaDiagnose.js";
import { parseDiagnosisJson } from "../src/lib/llmDiagnose.js";

test("ollama defaults", () => {
  const prevUrl = process.env.OLLAMA_BASE_URL;
  const prevModel = process.env.OLLAMA_MODEL;
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_MODEL;
  assert.equal(getOllamaBaseUrl(), "http://127.0.0.1:11434");
  assert.equal(getOllamaModel(), "llama3.2");
  if (prevUrl !== undefined) process.env.OLLAMA_BASE_URL = prevUrl;
  if (prevModel !== undefined) process.env.OLLAMA_MODEL = prevModel;
});

test("shared JSON parse works for ollama-shaped content", () => {
  const fields = parseDiagnosisJson(
    JSON.stringify({
      summary: "timeout",
      likelyCause: "flaky network",
      evidence: ["ETIMEDOUT"],
      nextSteps: ["retry"],
      confidence: "medium",
      needsHumanReview: true,
    }),
  );
  assert.equal(fields.summary, "timeout");
  assert.equal(fields.confidence, "medium");
});

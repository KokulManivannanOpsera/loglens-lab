import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreDiagnosis } from "../src/lib/evalScore.js";
import { runEvalSuite } from "../src/lib/runEvals.js";
import type { DiagnoseResponse } from "../src/lib/types.js";

describe("scoreDiagnosis", () => {
  it("fails when required runbook cite is missing", () => {
    const response: DiagnoseResponse = {
      diagnosis: {
        provider: "mock",
        summary: "Assertion failed",
        likelyCause: "Failing assertion in unit tests",
        evidence: ["FAIL"],
        nextSteps: ["Open test"],
        confidence: "high",
        needsHumanReview: false,
      },
      meta: {
        logChars: 10,
        fixtureHint: null,
        mode: "mock",
        fellBackToMock: false,
        fallbackReason: null,
        model: null,
        latencyMs: 1,
        truncated: false,
        truncateStrategy: "none",
        keptErrorLines: 0,
        injectionSuspected: false,
        injectionSignals: [],
        ragChunkCount: 4,
        ragHitCount: 0,
        ragTopScore: 0,
        ragWeak: true,
        ragSources: [],
        brain: "node-local",
      },
    };
    const scored = scoreDiagnosis("x", response, {
      mustCiteRunbook: ["assertion-failures"],
    });
    assert.equal(scored.pass, false);
    assert.ok(scored.checks.some((c) => c.name === "mustCiteRunbook" && !c.pass));
  });
});

describe("A3 eval suite (goldens)", () => {
  it("all goldens pass on mock + hybrid RAG", async () => {
    const { passed, failed, results } = await runEvalSuite();
    const report = results
      .map((r) => {
        const fails = r.checks.filter((c) => !c.pass);
        return fails.length
          ? `${r.id} FAIL:\n${fails.map((f) => `  - ${f.name}: ${f.detail}`).join("\n")}`
          : `${r.id} PASS`;
      })
      .join("\n");
    assert.equal(
      failed,
      0,
      `eval regressions (${failed} failed / ${passed + failed}):\n${report}`,
    );
    assert.ok(passed >= 5, `expected >=5 goldens, got ${passed}`);
  });
});

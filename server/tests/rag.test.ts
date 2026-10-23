import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  chunkMarkdown,
  groundWithRag,
  retrieveRunbooks,
  scoreChunk,
  tokenize,
} from "../src/lib/rag.js";
import type { Diagnosis } from "../src/lib/types.js";

const runbooksDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../knowledge/runbooks",
);

describe("tokenize", () => {
  it("drops stopwords and short tokens", () => {
    const t = tokenize("The FAIL AssertionError expected 1 to equal 2");
    assert.ok(t.includes("assertionerror") || t.includes("fail"));
    assert.ok(!t.includes("the"));
  });
});

describe("chunkMarkdown", () => {
  it("splits on ## headings", () => {
    const chunks = chunkMarkdown(
      "demo.md",
      "# Demo\n\nIntro\n\n## What it looks like\n\nTimeouts\n\n## What to do\n\nRetry\n",
    );
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.some((c) => /looks like/i.test(c.title)));
  });
});

describe("retrieveRunbooks", () => {
  it("ranks assertion runbook for AssertionError logs", () => {
    const log = readFileSync(
      path.join(path.dirname(runbooksDir), "../fixtures/logs/failing-test.txt"),
      "utf8",
    );
    const rag = retrieveRunbooks(log);
    assert.ok(rag.chunkCount >= 4);
    assert.ok(rag.hits.length >= 1);
    assert.ok(
      rag.hits.some((h) => h.source.includes("assertion")),
      `expected assertion runbook, got ${rag.hits.map((h) => h.source).join(",")}`,
    );
    assert.equal(rag.weak, false);
  });

  it("ranks missing-artifacts for 404 log fixture", () => {
    const log = readFileSync(
      path.join(path.dirname(runbooksDir), "../fixtures/logs/missing-logs.txt"),
      "utf8",
    );
    const rag = retrieveRunbooks(log);
    assert.ok(
      rag.hits.some((h) => h.source.includes("missing-artifacts")),
      `got ${rag.hits.map((h) => h.source).join(",")}`,
    );
  });

  it("marks nonsense log as weak retrieval", () => {
    const rag = retrieveRunbooks("zzzz qq xx yy totally unrelated blooper");
    assert.equal(rag.weak, true);
  });
});

describe("groundWithRag", () => {
  it("adds runbook citations and softens weak retrieval", () => {
    const base: Diagnosis = {
      provider: "mock",
      summary: "Unit test assertion failed",
      likelyCause: "Failing assertion",
      evidence: ["FAIL AssertionError"],
      nextSteps: ["Open the test"],
      confidence: "high",
      needsHumanReview: false,
    };
    const chunk = chunkMarkdown(
      "assertion-failures.md",
      readFileSync(path.join(runbooksDir, "assertion-failures.md"), "utf8"),
    )[0];
    const strong = groundWithRag(base, {
      hits: [{ ...chunk, score: 0.5 }],
      weak: false,
      chunkCount: 4,
      topScore: 0.5,
    });
    assert.ok(strong.evidence.some((e) => e.startsWith("runbook:")));

    const weak = groundWithRag(base, {
      hits: [],
      weak: true,
      chunkCount: 4,
      topScore: 0,
    });
    assert.equal(weak.needsHumanReview, true);
    assert.equal(weak.confidence, "medium");
  });
});

describe("scoreChunk", () => {
  it("scores higher when more query terms overlap", () => {
    const chunk = {
      id: "1",
      source: "t.md",
      title: "Timeouts",
      text: "flaky ETIMEDOUT network timeout exceeded",
    };
    const low = scoreChunk(tokenize("purple elephant ballet"), chunk);
    const high = scoreChunk(tokenize("flaky ETIMEDOUT timeout network"), chunk);
    assert.ok(high > low);
  });
});

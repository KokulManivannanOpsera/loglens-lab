import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readFixture } from "./fixtures.js";
import { scoreDiagnosis, type CaseScore, type GoldenCase } from "./evalScore.js";
import { runDiagnose } from "./runDiagnose.js";

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export function loadGoldens(
  goldensPath = path.join(serverRoot, "evals", "goldens.json"),
): GoldenCase[] {
  const raw = JSON.parse(readFileSync(goldensPath, "utf8")) as GoldenCase[];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`No goldens in ${goldensPath}`);
  }
  return raw;
}

/**
 * Run the eval suite against node-local mock diagnose + RAG.
 * Forces AI_SERVICE_URL off so results are deterministic for CI.
 */
export async function runEvalSuite(opts?: {
  goldensPath?: string;
}): Promise<{ passed: number; failed: number; results: CaseScore[] }> {
  const prevAi = process.env.AI_SERVICE_URL;
  const prevEmbed = process.env.EMBEDDING_PROVIDER;
  const prevMode = process.env.RAG_MODE;
  delete process.env.AI_SERVICE_URL;
  process.env.EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || "local";
  process.env.RAG_MODE = process.env.RAG_MODE || "hybrid";

  try {
    const goldens = loadGoldens(opts?.goldensPath);
    const results: CaseScore[] = [];

    for (const g of goldens) {
      const logText =
        g.logText ??
        (g.fixtureId ? readFixture(g.fixtureId) : null);
      if (!logText) {
        results.push({
          id: g.id,
          pass: false,
          checks: [
            {
              name: "loadLog",
              pass: false,
              detail: `missing fixtureId/logText for ${g.id}`,
            },
          ],
        });
        continue;
      }

      const response = await runDiagnose({
        logText,
        fixtureId: g.fixtureId ?? null,
        mode: g.mode ?? "mock",
      });
      results.push(scoreDiagnosis(g.id, response, g.expect));
    }

    const passed = results.filter((r) => r.pass).length;
    const failed = results.length - passed;
    return { passed, failed, results };
  } finally {
    if (prevAi === undefined) delete process.env.AI_SERVICE_URL;
    else process.env.AI_SERVICE_URL = prevAi;
    if (prevEmbed === undefined) delete process.env.EMBEDDING_PROVIDER;
    else process.env.EMBEDDING_PROVIDER = prevEmbed;
    if (prevMode === undefined) delete process.env.RAG_MODE;
    else process.env.RAG_MODE = prevMode;
  }
}

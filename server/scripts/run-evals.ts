/**
 * A3 — run golden evals from CLI:
 *   npm run eval --workspace=server
 */
import { runEvalSuite } from "../src/lib/runEvals.js";

const { passed, failed, results } = await runEvalSuite();
for (const r of results) {
  const mark = r.pass ? "PASS" : "FAIL";
  console.log(`${mark}  ${r.id}`);
  for (const c of r.checks) {
    if (!c.pass) console.log(`       ✗ ${c.name}: ${c.detail}`);
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

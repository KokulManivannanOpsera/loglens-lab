import type { DiagnoseResponse } from "./types.js";

export type GoldenExpect = {
  causeIncludes?: string[];
  /** If true, any one of causeIncludes is enough; else all required */
  causeIncludesAny?: boolean;
  mustCiteRunbook?: string[];
  ragWeak?: boolean;
  needsHumanReview?: boolean;
  injectionSuspected?: boolean;
  provider?: string;
  ragMode?: string;
  nextStepsMustNotMatch?: string[];
};

export type GoldenCase = {
  id: string;
  fixtureId?: string;
  logText?: string;
  mode?: string;
  expect: GoldenExpect;
};

export type CheckResult = {
  name: string;
  pass: boolean;
  detail: string;
};

export type CaseScore = {
  id: string;
  pass: boolean;
  checks: CheckResult[];
};

function includesCI(hay: string, needle: string): boolean {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Score one diagnose response against golden expectations.
 * Pure checks — no LLM-as-judge (keeps evals cheap and CI-friendly).
 */
export function scoreDiagnosis(
  id: string,
  response: DiagnoseResponse,
  expect: GoldenExpect,
): CaseScore {
  const checks: CheckResult[] = [];
  const { diagnosis, meta } = response;
  const cause = `${diagnosis.likelyCause} ${diagnosis.summary}`;
  const evidence = diagnosis.evidence.join("\n");
  const cited = `${evidence}\n${meta.ragSources.join("\n")}`;

  if (expect.causeIncludes?.length) {
    const needles = expect.causeIncludes;
    const hits = needles.filter((n) => includesCI(cause, n));
    const ok = expect.causeIncludesAny
      ? hits.length >= 1
      : hits.length === needles.length;
    checks.push({
      name: "causeIncludes",
      pass: ok,
      detail: expect.causeIncludesAny
        ? `any of [${needles.join(", ")}] → matched [${hits.join(", ") || "none"}]`
        : `all of [${needles.join(", ")}] → matched [${hits.join(", ") || "none"}]`,
    });
  }

  if (expect.mustCiteRunbook?.length) {
    const missing = expect.mustCiteRunbook.filter((r) => !includesCI(cited, r));
    checks.push({
      name: "mustCiteRunbook",
      pass: missing.length === 0,
      detail:
        missing.length === 0
          ? `cited ${expect.mustCiteRunbook.join(", ")}`
          : `missing runbook cite: ${missing.join(", ")}; saw: ${meta.ragSources.join(", ") || evidence.slice(0, 120)}`,
    });
  }

  if (typeof expect.ragWeak === "boolean") {
    checks.push({
      name: "ragWeak",
      pass: meta.ragWeak === expect.ragWeak,
      detail: `expected ragWeak=${expect.ragWeak}, got ${meta.ragWeak}`,
    });
  }

  if (typeof expect.needsHumanReview === "boolean") {
    checks.push({
      name: "needsHumanReview",
      pass: diagnosis.needsHumanReview === expect.needsHumanReview,
      detail: `expected needsHumanReview=${expect.needsHumanReview}, got ${diagnosis.needsHumanReview}`,
    });
  }

  if (typeof expect.injectionSuspected === "boolean") {
    checks.push({
      name: "injectionSuspected",
      pass: meta.injectionSuspected === expect.injectionSuspected,
      detail: `expected injectionSuspected=${expect.injectionSuspected}, got ${meta.injectionSuspected}`,
    });
  }

  if (expect.provider) {
    checks.push({
      name: "provider",
      pass: diagnosis.provider === expect.provider,
      detail: `expected provider=${expect.provider}, got ${diagnosis.provider}`,
    });
  }

  if (expect.ragMode) {
    checks.push({
      name: "ragMode",
      pass: (meta.ragMode || "keyword") === expect.ragMode,
      detail: `expected ragMode=${expect.ragMode}, got ${meta.ragMode}`,
    });
  }

  if (expect.nextStepsMustNotMatch?.length) {
    const steps = diagnosis.nextSteps.join("\n");
    const bad = expect.nextStepsMustNotMatch.filter((pat) =>
      new RegExp(pat, "i").test(steps),
    );
    checks.push({
      name: "nextStepsMustNotMatch",
      pass: bad.length === 0,
      detail:
        bad.length === 0
          ? "no unsafe auto-action steps"
          : `unsafe patterns in nextSteps: ${bad.join("; ")}`,
    });
  }

  return {
    id,
    pass: checks.every((c) => c.pass),
    checks,
  };
}

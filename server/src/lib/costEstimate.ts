/**
 * BRING — Cost role (FinOps-lite): rough LLM $ proxy from Insights.
 * Not billed usage — lab estimate for openai provider runs only.
 */

/** ~$0.0002 per diagnose as a stand-in for gpt-4o-mini short calls */
const USD_PER_OPENAI_RUN = Number(
  process.env.COST_USD_PER_OPENAI_RUN || "0.0002",
);

export type CostEstimate = {
  currency: "USD";
  openaiRuns: number;
  mockRuns: number;
  estimatedUsd: number;
  usdPerOpenaiRun: number;
  note: string;
};

export function estimateDiagnoseCost(byProvider: {
  provider: string;
  count: number;
}[]): CostEstimate {
  const openaiRuns = byProvider
    .filter((p) => p.provider === "openai")
    .reduce((s, p) => s + p.count, 0);
  const mockRuns = byProvider
    .filter((p) => p.provider === "mock")
    .reduce((s, p) => s + p.count, 0);
  const estimatedUsd = Number((openaiRuns * USD_PER_OPENAI_RUN).toFixed(6));
  return {
    currency: "USD",
    openaiRuns,
    mockRuns,
    estimatedUsd,
    usdPerOpenaiRun: USD_PER_OPENAI_RUN,
    note: "Proxy only — not OpenAI billing. Mock runs = $0. Tune COST_USD_PER_OPENAI_RUN.",
  };
}

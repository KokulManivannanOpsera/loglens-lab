export type Provider = "mock" | "openai";

export type Diagnosis = {
  provider: Provider;
  summary: string;
  likelyCause: string;
  evidence: string[];
  nextSteps: string[];
  confidence: "low" | "medium" | "high";
  /** True when we should not pretend certainty / no auto actions */
  needsHumanReview: boolean;
};

export type DiagnoseResponse = {
  diagnosis: Diagnosis;
  meta: {
    logChars: number;
    fixtureHint: string | null;
    /** Which path was requested */
    mode: "auto" | "mock" | "openai";
    /** If openai failed and we used mock */
    fellBackToMock: boolean;
    fallbackReason: string | null;
    model: string | null;
    latencyMs: number;
  };
};

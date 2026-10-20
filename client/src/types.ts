export type Provider = "mock" | "openai";

export type Diagnosis = {
  provider: Provider;
  summary: string;
  likelyCause: string;
  evidence: string[];
  nextSteps: string[];
  confidence: "low" | "medium" | "high";
  needsHumanReview: boolean;
};

export type DiagnoseResponse = {
  diagnosis: Diagnosis;
  meta: {
    logChars: number;
    fixtureHint: string | null;
    mode: "auto" | "mock" | "openai";
    fellBackToMock: boolean;
    fallbackReason: string | null;
    model: string | null;
    latencyMs: number;
  };
};

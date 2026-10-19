export type Diagnosis = {
  /** How the answer was produced in A0 */
  provider: "mock";
  summary: string;
  likelyCause: string;
  evidence: string[];
  nextSteps: string[];
  confidence: "low" | "medium" | "high";
  /** True when the model (or mock) should not pretend certainty */
  needsHumanReview: boolean;
};

export type DiagnoseResponse = {
  diagnosis: Diagnosis;
  meta: {
    logChars: number;
    fixtureHint: string | null;
  };
};

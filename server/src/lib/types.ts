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

export type TruncateStrategy = "none" | "head-tail" | "error-aware";

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
    /** A1b: how the log was windowed for context */
    truncated: boolean;
    truncateStrategy: TruncateStrategy;
    keptErrorLines: number;
    /** A1c: log looked like it tried to override instructions */
    injectionSuspected: boolean;
    injectionSignals: string[];
    /** A2: keyword RAG over runbooks */
    ragChunkCount: number;
    ragHitCount: number;
    ragTopScore: number;
    ragWeak: boolean;
    ragSources: string[];
    /** A2b: keyword | vector | hybrid */
    ragMode?: "keyword" | "vector" | "hybrid";
    ragEmbeddingProvider?: "local" | "openai" | "none";
    ragEmbeddingModel?: string | null;
    /** Which process produced the diagnosis */
    brain: "python" | "node-local";
    /** DATA-0: persisted history row id (if save succeeded) */
    runId?: string | null;
    /** DATA-0: served from in-process log-hash cache */
    fromCache?: boolean;
  };
};

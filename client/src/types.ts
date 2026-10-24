export type Provider = "mock" | "openai" | "ollama";

export type Diagnosis = {
  provider: Provider;
  summary: string;
  likelyCause: string;
  evidence: string[];
  nextSteps: string[];
  confidence: "low" | "medium" | "high";
  needsHumanReview: boolean;
};

export type TruncateStrategy = "none" | "head-tail" | "error-aware";

export type DiagnoseResponse = {
  diagnosis: Diagnosis;
  meta: {
    logChars: number;
    fixtureHint: string | null;
    mode: "auto" | "mock" | "openai" | "ollama";
    fellBackToMock: boolean;
    fallbackReason: string | null;
    model: string | null;
    latencyMs: number;
    truncated: boolean;
    truncateStrategy: TruncateStrategy;
    keptErrorLines: number;
    injectionSuspected: boolean;
    injectionSignals: string[];
    ragChunkCount: number;
    ragHitCount: number;
    ragTopScore: number;
    ragWeak: boolean;
    ragSources: string[];
    ragMode?: "keyword" | "vector" | "hybrid";
    ragEmbeddingProvider?: "local" | "openai" | "none";
    ragEmbeddingModel?: string | null;
    brain?: "python" | "node-local";
    runId?: string | null;
    fromCache?: boolean;
    /** A5 — from SSE /api/diagnose/stream */
    streamed?: boolean;
    /** A4 — tool trail + pending write approvals */
    agent?: {
      enabled: boolean;
      maxSteps: number;
      allowlist: string[];
      refusedSignals: string[];
      toolCalls: {
        id: string;
        step: number;
        tool: string;
        args: Record<string, unknown>;
        reason?: string;
        sideEffect: "read" | "write";
        result: Record<string, unknown>;
      }[];
      pendingApprovals: {
        id: string;
        tool: string;
        draft: Record<string, unknown>;
        status: string;
      }[];
      shadowMode: boolean;
      note: string;
    };
  };
};

export type HistoryListItem = {
  id: string;
  createdAt: string;
  logPreview: string;
  fixtureId: string | null;
  provider: string;
  brain: string;
  likelyCause: string;
  summary: string;
  confidence: string;
  needsHumanReview: boolean;
  ragWeak: boolean;
};

export type Insights = {
  totalRuns: number;
  needsReviewCount: number;
  needsReviewRate: number;
  ragWeakCount: number;
  byProvider: { provider: string; count: number }[];
  byBrain: { brain: string; count: number }[];
  byConfidence: { confidence: string; count: number }[];
  topCauses: { cause: string; count: number }[];
  costEstimate?: {
    currency: "USD";
    openaiRuns: number;
    mockRuns: number;
    estimatedUsd: number;
    usdPerOpenaiRun: number;
    note: string;
  };
};

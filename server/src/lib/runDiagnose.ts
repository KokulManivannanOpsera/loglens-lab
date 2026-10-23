import {
  diagnoseViaAiService,
  getAiServiceUrl,
  isAiServiceRequired,
} from "./aiClient.js";
import { mockDiagnose } from "./mockDiagnose.js";
import { openaiDiagnose } from "./llmDiagnose.js";
import { enforceHitlPolicy, scanForInjection } from "./promptGuard.js";
import { groundWithRag, retrieveRunbooksAsync } from "./rag.js";
import { isLlmConfigured } from "./secrets.js";
import { truncateLog } from "./truncateLog.js";
import type { DiagnoseResponse, Diagnosis } from "./types.js";

export type DiagnoseMode = "auto" | "mock" | "openai";

function resolveMode(requested?: string): DiagnoseMode {
  const fromEnv = (process.env.DIAGNOSE_MODE || "auto").toLowerCase();
  const raw = (requested || fromEnv) as string;
  if (raw === "mock" || raw === "openai" || raw === "auto") return raw;
  return "auto";
}

function withTruncationNote(diagnosis: Diagnosis, truncated: boolean): Diagnosis {
  if (!truncated) return diagnosis;
  return {
    ...diagnosis,
    summary: `${diagnosis.summary} (note: log was truncated for context window)`,
    needsHumanReview: true,
  };
}

function finalizeDiagnosis(
  diagnosis: Diagnosis,
  truncated: boolean,
  injection: ReturnType<typeof scanForInjection>,
  rag: Awaited<ReturnType<typeof retrieveRunbooksAsync>>,
): Diagnosis {
  const withRag = groundWithRag(diagnosis, rag);
  return enforceHitlPolicy(withTruncationNote(withRag, truncated), injection);
}

async function runDiagnoseLocal(opts: {
  logText: string;
  fixtureId?: string | null;
  mode?: string;
}): Promise<DiagnoseResponse> {
  const started = Date.now();
  const mode = resolveMode(opts.mode);
  const { text, truncated, strategy, keptErrorLines } = truncateLog(opts.logText);
  const injection = scanForInjection(text);
  const rag = await retrieveRunbooksAsync(text);

  const baseMeta = {
    logChars: opts.logText.length,
    fixtureHint: opts.fixtureId ?? null,
    mode,
    truncated,
    truncateStrategy: strategy,
    keptErrorLines,
    injectionSuspected: injection.suspected,
    injectionSignals: injection.signals,
    ragChunkCount: rag.chunkCount,
    ragHitCount: rag.hits.length,
    ragTopScore: Number(rag.topScore.toFixed(4)),
    ragWeak: rag.weak,
    ragSources: rag.hits.map((h) => h.source),
    ragMode: rag.mode,
    ragEmbeddingProvider: rag.embeddingProvider,
    ragEmbeddingModel: rag.embeddingModel,
    brain: "node-local" as const,
  };

  const hasKey = isLlmConfigured();
  const useMock = mode === "mock" || (mode === "auto" && !hasKey);

  if (useMock) {
    const diagnosis = finalizeDiagnosis(
      mockDiagnose(text),
      truncated,
      injection,
      rag,
    );
    return {
      diagnosis,
      meta: {
        ...baseMeta,
        fellBackToMock: false,
        fallbackReason: truncated ? `log truncated (${strategy})` : null,
        model: null,
        latencyMs: Date.now() - started,
      },
    };
  }

  try {
    const { diagnosis, model } = await openaiDiagnose(text, rag.hits);
    return {
      diagnosis: finalizeDiagnosis(diagnosis, truncated, injection, rag),
      meta: {
        ...baseMeta,
        fellBackToMock: false,
        fallbackReason: truncated ? `log truncated (${strategy})` : null,
        model,
        latencyMs: Date.now() - started,
      },
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "llm error";
    if (mode === "openai") {
      throw err;
    }
    const diagnosis = finalizeDiagnosis(
      mockDiagnose(text),
      truncated,
      injection,
      rag,
    );
    return {
      diagnosis: {
        ...diagnosis,
        summary: `${diagnosis.summary} [fell back to mock: ${reason}]`,
        needsHumanReview: true,
      },
      meta: {
        ...baseMeta,
        fellBackToMock: true,
        fallbackReason: reason,
        model: null,
        latencyMs: Date.now() - started,
      },
    };
  }
}

/**
 * Prefer Python AI microservice when AI_SERVICE_URL is set.
 * On AI failure: local Node path (unless AI_SERVICE_REQUIRED=true).
 * Local path still has A1b/A1c/A2 for offline/dev without Python.
 */
export async function runDiagnose(opts: {
  logText: string;
  fixtureId?: string | null;
  mode?: string;
  requestId?: string;
}): Promise<DiagnoseResponse> {
  const aiUrl = getAiServiceUrl();
  if (aiUrl) {
    try {
      return await diagnoseViaAiService(aiUrl, opts);
    } catch (err) {
      if (isAiServiceRequired()) {
        throw err;
      }
      const local = await runDiagnoseLocal(opts);
      const reason = err instanceof Error ? err.message : "ai service error";
      return {
        ...local,
        diagnosis: {
          ...local.diagnosis,
          summary: `${local.diagnosis.summary} [AI service unavailable → node-local: ${reason}]`,
          needsHumanReview: true,
        },
        meta: {
          ...local.meta,
          fellBackToMock: local.meta.fellBackToMock,
          fallbackReason: `ai→local: ${reason}`,
          brain: "node-local",
        },
      };
    }
  }

  return runDiagnoseLocal(opts);
}

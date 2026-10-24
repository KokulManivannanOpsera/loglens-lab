import {
  diagnoseViaAiService,
  getAiServiceUrl,
  isAiServiceRequired,
} from "./aiClient.js";
import { enrichDiagnosisWithAgent, runNodeAgent } from "./agent.js";
import { mockDiagnose } from "./mockDiagnose.js";
import { openaiDiagnose } from "./llmDiagnose.js";
import { ollamaDiagnose, ollamaReachable } from "./ollamaDiagnose.js";
import { enforceHitlPolicy, scanForInjection } from "./promptGuard.js";
import { groundWithRag, retrieveRunbooksAsync } from "./rag.js";
import { isLlmConfigured } from "./secrets.js";
import { truncateLog } from "./truncateLog.js";
import type { DiagnoseResponse, Diagnosis } from "./types.js";

export type DiagnoseMode = "auto" | "mock" | "openai" | "ollama";

function resolveMode(requested?: string): DiagnoseMode {
  const fromEnv = (process.env.DIAGNOSE_MODE || "auto").toLowerCase();
  const raw = (requested || fromEnv) as string;
  if (
    raw === "mock" ||
    raw === "openai" ||
    raw === "auto" ||
    raw === "ollama"
  ) {
    return raw;
  }
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
  const preferOllama =
    mode === "ollama" ||
    (mode === "auto" &&
      !hasKey &&
      (process.env.OLLAMA_BASE_URL?.trim() ||
        (await ollamaReachable())));

  let diagnosis: Diagnosis;
  let fellBackToMock = false;
  let fallbackReason: string | null = truncated
    ? `log truncated (${strategy})`
    : null;
  let model: string | null = null;

  if (mode === "mock" || (mode === "auto" && !hasKey && !preferOllama)) {
    diagnosis = finalizeDiagnosis(mockDiagnose(text), truncated, injection, rag);
  } else if (preferOllama) {
    try {
      const out = await ollamaDiagnose(text, rag.hits);
      diagnosis = finalizeDiagnosis(out.diagnosis, truncated, injection, rag);
      model = out.model;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "ollama error";
      if (mode === "ollama") {
        throw err;
      }
      fellBackToMock = true;
      fallbackReason = reason;
      diagnosis = finalizeDiagnosis(
        mockDiagnose(text),
        truncated,
        injection,
        rag,
      );
      diagnosis = {
        ...diagnosis,
        summary: `${diagnosis.summary} [fell back to mock: ${reason}]`,
        needsHumanReview: true,
      };
    }
  } else {
    try {
      const out = await openaiDiagnose(text, rag.hits);
      diagnosis = finalizeDiagnosis(out.diagnosis, truncated, injection, rag);
      model = out.model;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "llm error";
      if (mode === "openai") {
        throw err;
      }
      // auto: try Ollama before mock if reachable
      if (await ollamaReachable()) {
        try {
          const out = await ollamaDiagnose(text, rag.hits);
          diagnosis = finalizeDiagnosis(
            out.diagnosis,
            truncated,
            injection,
            rag,
          );
          model = out.model;
          fallbackReason = `openai failed → ollama: ${reason}`;
        } catch (ollamaErr) {
          const oReason =
            ollamaErr instanceof Error ? ollamaErr.message : "ollama error";
          fellBackToMock = true;
          fallbackReason = `${reason}; ollama: ${oReason}`;
          diagnosis = finalizeDiagnosis(
            mockDiagnose(text),
            truncated,
            injection,
            rag,
          );
          diagnosis = {
            ...diagnosis,
            summary: `${diagnosis.summary} [fell back to mock: ${fallbackReason}]`,
            needsHumanReview: true,
          };
        }
      } else {
        fellBackToMock = true;
        fallbackReason = reason;
        diagnosis = finalizeDiagnosis(
          mockDiagnose(text),
          truncated,
          injection,
          rag,
        );
        diagnosis = {
          ...diagnosis,
          summary: `${diagnosis.summary} [fell back to mock: ${reason}]`,
          needsHumanReview: true,
        };
      }
    }
  }

  const agent = await runNodeAgent(text);
  diagnosis = enrichDiagnosisWithAgent(diagnosis, agent);

  return {
    diagnosis,
    meta: {
      ...baseMeta,
      fellBackToMock,
      fallbackReason,
      model,
      latencyMs: Date.now() - started,
      agent,
    },
  };
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

import { mockDiagnose } from "./mockDiagnose";
import { openaiDiagnose } from "./llmDiagnose";
import { truncateLog } from "./truncateLog";
import type { DiagnoseResponse, Diagnosis } from "./types";

export type DiagnoseMode = "auto" | "mock" | "openai";

function resolveMode(requested?: string): DiagnoseMode {
  const fromEnv = (process.env.DIAGNOSE_MODE || "auto").toLowerCase();
  const raw = (requested || fromEnv) as string;
  if (raw === "mock" || raw === "openai" || raw === "auto") return raw;
  return "auto";
}

/**
 * A1 entry: prefer OpenAI when key + mode allow; otherwise mock.
 * On LLM failure in auto mode → fall back to mock (still a draft, never throws to user as 500 for provider blips).
 */
export async function runDiagnose(opts: {
  logText: string;
  fixtureId?: string | null;
  mode?: string;
}): Promise<DiagnoseResponse> {
  const started = Date.now();
  const mode = resolveMode(opts.mode);
  const { text, truncated } = truncateLog(opts.logText);

  const baseMeta = {
    logChars: opts.logText.length,
    fixtureHint: opts.fixtureId ?? null,
    mode,
  };

  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  const useMock = mode === "mock" || (mode === "auto" && !hasKey);

  if (useMock) {
    const diagnosis = mockDiagnose(text);
    return {
      diagnosis,
      meta: {
        ...baseMeta,
        fellBackToMock: false,
        fallbackReason: truncated ? "log truncated for context" : null,
        model: null,
        latencyMs: Date.now() - started,
      },
    };
  }

  // mode === "openai" (with or without key) or mode === "auto" with key

  try {
    const { diagnosis, model } = await openaiDiagnose(text);
    const withNote: Diagnosis = truncated
      ? {
          ...diagnosis,
          summary: `${diagnosis.summary} (note: log was truncated for context window)`,
          needsHumanReview: true,
        }
      : diagnosis;

    return {
      diagnosis: withNote,
      meta: {
        ...baseMeta,
        fellBackToMock: false,
        fallbackReason: truncated ? "log truncated for context" : null,
        model,
        latencyMs: Date.now() - started,
      },
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "llm error";
    if (mode === "openai") {
      // Explicit openai mode: surface the error instead of hiding it
      throw err;
    }
    const diagnosis = mockDiagnose(text);
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

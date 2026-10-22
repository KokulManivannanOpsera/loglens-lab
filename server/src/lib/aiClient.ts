import type { DiagnoseResponse } from "./types.js";

/** Base URL of the Python AI microservice, e.g. http://127.0.0.1:8092 or http://ai:8092 */
export function getAiServiceUrl(): string | null {
  const url = process.env.AI_SERVICE_URL?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

export function isAiServiceRequired(): boolean {
  return (process.env.AI_SERVICE_REQUIRED || "").toLowerCase() === "true";
}

/**
 * Call Python brain: POST /v1/diagnose
 * Contract matches DiagnoseResponse (+ meta.brain = "python").
 */
export async function diagnoseViaAiService(
  baseUrl: string,
  opts: { logText: string; fixtureId?: string | null; mode?: string },
): Promise<DiagnoseResponse> {
  const timeoutMs = Number(process.env.AI_SERVICE_TIMEOUT_MS || 60_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/v1/diagnose`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        logText: opts.logText,
        fixtureId: opts.fixtureId ?? null,
        mode: opts.mode ?? null,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AI service HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as DiagnoseResponse;
    if (!data?.diagnosis || !data?.meta) {
      throw new Error("AI service returned unexpected shape");
    }
    return {
      ...data,
      meta: {
        ...data.meta,
        brain: data.meta.brain ?? "python",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function aiServiceHealth(
  baseUrl: string,
): Promise<{ ok: boolean; detail?: unknown }> {
  try {
    const res = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return { ok: false, detail: { status: res.status } };
    return { ok: true, detail: await res.json() };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "ai health failed",
    };
  }
}

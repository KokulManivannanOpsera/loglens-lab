/**
 * A5 — stream a diagnose run as SSE-friendly events.
 *
 * Pitfall: never treat `delta` text as complete JSON. Only `done` (sent by the
 * route after validate + optional persist) carries a DiagnoseResponse.
 */
import { runDiagnose } from "./runDiagnose.js";
import { sleep } from "./sse.js";
import type { DiagnoseResponse } from "./types.js";

export type StreamEvent =
  | { event: "status"; data: { phase: string; detail?: string } }
  | { event: "delta"; data: { text: string; kind: "preview" | "token" } }
  | { event: "error"; data: { error: string } }
  | { event: "cancelled"; data: { reason: string } };

export type StreamEmit = (ev: StreamEvent) => boolean;

function isAbort(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === "AbortError") ||
    (typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as { name: string }).name === "AbortError")
  );
}

/** Split text into small chunks so cancel + typing UX are visible in mock. */
export function chunkForPreview(text: string, size = 12): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    out.push(text.slice(i, i + size));
  }
  return out.length ? out : [""];
}

export type StreamResult =
  | { outcome: "done"; response: DiagnoseResponse }
  | { outcome: "cancelled" }
  | { outcome: "error"; error: string };

/**
 * Run full diagnose (same brain as POST /api/diagnose), then stream a preview
 * of the summary. Caller sends the final `done` event (with runId etc.).
 */
export async function streamDiagnoseRun(
  opts: {
    logText: string;
    fixtureId?: string | null;
    mode?: string;
    requestId?: string;
    signal: AbortSignal;
  },
  emit: StreamEmit,
): Promise<StreamResult> {
  const { signal } = opts;

  const alive = (ev: StreamEvent) => {
    if (signal.aborted) return false;
    return emit(ev);
  };

  try {
    if (!alive({ event: "status", data: { phase: "start", detail: "diagnose" } })) {
      return { outcome: "cancelled" };
    }

    if (
      !alive({
        event: "status",
        data: { phase: "brain", detail: "running diagnose (mock/LLM/agent)" },
      })
    ) {
      return { outcome: "cancelled" };
    }

    const response = await runDiagnose({
      logText: opts.logText,
      fixtureId: opts.fixtureId,
      mode: opts.mode,
      requestId: opts.requestId,
    });

    if (signal.aborted) {
      alive({ event: "cancelled", data: { reason: "client aborted" } });
      return { outcome: "cancelled" };
    }

    const preview = [
      response.diagnosis.summary,
      "",
      `Likely cause: ${response.diagnosis.likelyCause}`,
    ].join("\n");

    if (
      !alive({
        event: "status",
        data: {
          phase: "streaming",
          detail: "preview deltas only — do not JSON.parse until event=done",
        },
      })
    ) {
      return { outcome: "cancelled" };
    }

    for (const piece of chunkForPreview(preview, 16)) {
      if (signal.aborted) {
        alive({ event: "cancelled", data: { reason: "client aborted" } });
        return { outcome: "cancelled" };
      }
      if (!alive({ event: "delta", data: { text: piece, kind: "preview" } })) {
        return { outcome: "cancelled" };
      }
      await sleep(28, signal);
    }

    if (signal.aborted) {
      alive({ event: "cancelled", data: { reason: "client aborted" } });
      return { outcome: "cancelled" };
    }

    return { outcome: "done", response };
  } catch (err) {
    if (isAbort(err) || signal.aborted) {
      alive({ event: "cancelled", data: { reason: "client aborted" } });
      return { outcome: "cancelled" };
    }
    const message = err instanceof Error ? err.message : "stream diagnose failed";
    alive({ event: "error", data: { error: message } });
    return { outcome: "error", error: message };
  }
}

/**
 * BRING — Serving: local Ollama HTTP API (offline lab model).
 * Same JSON contract as OpenAI path; provider labeled "ollama".
 */
import type { Diagnosis } from "./types.js";
import {
  buildDiagnoseUserContent,
  DIAGNOSE_SYSTEM_PROMPT,
  parseDiagnosisJson,
  type LlmResult,
} from "./llmDiagnose.js";
import type { RagHit } from "./rag.js";

export function getOllamaBaseUrl(): string {
  return (
    process.env.OLLAMA_BASE_URL?.trim().replace(/\/$/, "") ||
    "http://127.0.0.1:11434"
  );
}

export function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL?.trim() || "llama3.2";
}

export async function ollamaReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${getOllamaBaseUrl()}/api/tags`, {
      signal: AbortSignal.timeout(2_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ollamaDiagnose(
  logText: string,
  ragHits: RagHit[] = [],
): Promise<LlmResult> {
  const base = getOllamaBaseUrl();
  const model = getOllamaModel();
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 90_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const userContent = buildDiagnoseUserContent(logText, ragHits);

  try {
    // Chat API — ask for JSON only (no response_format on older Ollama).
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        options: { temperature: 0.2 },
        messages: [
          { role: "system", content: DIAGNOSE_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Ollama HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const payload = (await res.json()) as {
      message?: { content?: string };
    };
    const content = payload.message?.content;
    if (!content) throw new Error("empty Ollama content");

    const fields = parseDiagnosisJson(content);
    return {
      model: `ollama:${model}`,
      diagnosis: { ...fields, provider: "ollama" as Diagnosis["provider"] },
    };
  } finally {
    clearTimeout(timer);
  }
}

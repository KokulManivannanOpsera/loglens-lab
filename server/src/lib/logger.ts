import { redactSecrets } from "./secrets.js";

/** A3b — prompt template/version id for logs (bump when system prompt changes). */
export const PROMPT_VERSION = process.env.PROMPT_VERSION?.trim() || "loglens-diagnose-v1";

export type LogFields = Record<string, unknown>;

function safeValue(v: unknown): unknown {
  if (typeof v === "string") return redactSecrets(v).slice(0, 500);
  if (v instanceof Error) {
    return { name: v.name, message: redactSecrets(v.message).slice(0, 500) };
  }
  return v;
}

/** Structured JSON log line — no secrets / raw logs / passwords. */
export function log(
  level: "info" | "warn" | "error",
  msg: string,
  fields: LogFields = {},
): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    service: "loglens-api",
    promptVersion: PROMPT_VERSION,
    ...Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, safeValue(v)]),
    ),
  };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

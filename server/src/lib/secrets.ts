import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

/**
 * D6 — load secrets from server/.env (never from the client bundle).
 * Path is anchored to this file so it works whether you start from repo root or server/.
 */
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(serverRoot, ".env") });

/** True when a non-empty OpenAI key is loaded — never returns the key itself. */
export function isLlmConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/**
 * Strip secret-shaped substrings from strings we might return in HTTP errors / logs.
 * Defense in depth if an upstream error body ever echoed a key.
 */
export function redactSecrets(text: string): string {
  let out = text;
  const key = process.env.OPENAI_API_KEY?.trim();
  if (key && key.length >= 8) {
    out = out.split(key).join("[REDACTED_OPENAI_KEY]");
  }
  // Common key prefixes even if env differs from what was logged
  out = out.replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_API_KEY]");
  out = out.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]");
  return out;
}

export function getServerEnvInfo(): {
  port: number;
  diagnoseMode: string;
  llmConfigured: boolean;
  envFile: string;
} {
  return {
    port: Number(process.env.PORT || 8091),
    diagnoseMode: (process.env.DIAGNOSE_MODE || "auto").toLowerCase(),
    llmConfigured: isLlmConfigured(),
    envFile: path.join(serverRoot, ".env"),
  };
}

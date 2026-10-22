/**
 * DATA-0 — KV / cache role (in-process Map).
 * Same key idea as Redis later: logHash → recent diagnosis for this user.
 * Identical log paste can skip a repeat LLM call within TTL.
 */

import type { DiagnoseResponse } from "./types.js";

type CacheEntry = {
  expiresAt: number;
  response: DiagnoseResponse;
  runId: string;
};

const store = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

function key(userId: string, logHash: string): string {
  return `${userId}:${logHash}`;
}

export function cacheGet(
  userId: string,
  logHash: string,
): { response: DiagnoseResponse; runId: string } | null {
  const k = key(userId, logHash);
  const hit = store.get(k);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(k);
    return null;
  }
  return { response: hit.response, runId: hit.runId };
}

export function cacheSet(
  userId: string,
  logHash: string,
  runId: string,
  response: DiagnoseResponse,
  ttlMs = DEFAULT_TTL_MS,
): void {
  store.set(key(userId, logHash), {
    expiresAt: Date.now() + ttlMs,
    response,
    runId,
  });
}

export function cacheClear(): void {
  store.clear();
}

/**
 * D8 / A3b — in-process metrics (Prometheus-shaped JSON).
 * Process-local: resets on restart. Good enough for lab + /api/metrics scrape.
 */

import { PROMPT_VERSION } from "./logger.js";

type LatencyAgg = { count: number; sumMs: number; maxMs: number };

const httpByKey = new Map<string, number>();
const diagnose: {
  total: number;
  errors: number;
  cacheHits: number;
  ungrounded: number; // ragWeak
  needsReview: number;
  latency: LatencyAgg;
} = {
  total: 0,
  errors: 0,
  cacheHits: 0,
  ungrounded: 0,
  needsReview: 0,
  latency: { count: 0, sumMs: 0, maxMs: 0 },
};

function httpKey(method: string, route: string, status: number): string {
  return `${method}|${route}|${status}`;
}

export function observeHttp(method: string, route: string, status: number): void {
  const k = httpKey(method, route, status);
  httpByKey.set(k, (httpByKey.get(k) ?? 0) + 1);
}

export function observeDiagnose(input: {
  ok: boolean;
  fromCache?: boolean;
  latencyMs: number;
  ragWeak?: boolean;
  needsHumanReview?: boolean;
}): void {
  diagnose.total += 1;
  if (!input.ok) diagnose.errors += 1;
  if (input.fromCache) diagnose.cacheHits += 1;
  if (input.ragWeak) diagnose.ungrounded += 1;
  if (input.needsHumanReview) diagnose.needsReview += 1;
  if (!input.fromCache && input.ok) {
    diagnose.latency.count += 1;
    diagnose.latency.sumMs += input.latencyMs;
    diagnose.latency.maxMs = Math.max(diagnose.latency.maxMs, input.latencyMs);
  }
}

/** Snapshot for GET /api/metrics */
export function getMetricsSnapshot(): {
  service: string;
  promptVersion: string;
  httpRequestsTotal: { method: string; route: string; status: number; count: number }[];
  diagnose: {
    total: number;
    errors: number;
    cacheHits: number;
    ungrounded: number;
    ungroundedRate: number;
    needsReview: number;
    needsReviewRate: number;
    latencyMs: { count: number; avg: number; max: number };
  };
} {
  const httpRequestsTotal = [...httpByKey.entries()].map(([k, count]) => {
    const [method, route, status] = k.split("|");
    return { method, route, status: Number(status), count };
  });

  const { count, sumMs, maxMs } = diagnose.latency;
  const total = diagnose.total || 0;

  return {
    service: "loglens-api",
    promptVersion: PROMPT_VERSION,
    httpRequestsTotal,
    diagnose: {
      total: diagnose.total,
      errors: diagnose.errors,
      cacheHits: diagnose.cacheHits,
      ungrounded: diagnose.ungrounded,
      ungroundedRate: total === 0 ? 0 : diagnose.ungrounded / total,
      needsReview: diagnose.needsReview,
      needsReviewRate: total === 0 ? 0 : diagnose.needsReview / total,
      latencyMs: {
        count,
        avg: count === 0 ? 0 : Math.round(sumMs / count),
        max: maxMs,
      },
    },
  };
}

/** Test helper */
export function resetMetrics(): void {
  httpByKey.clear();
  diagnose.total = 0;
  diagnose.errors = 0;
  diagnose.cacheHits = 0;
  diagnose.ungrounded = 0;
  diagnose.needsReview = 0;
  diagnose.latency = { count: 0, sumMs: 0, maxMs: 0 };
}

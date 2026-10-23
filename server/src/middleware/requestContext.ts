import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { log } from "../lib/logger.js";
import { observeHttp } from "../lib/metrics.js";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      log?: (level: "info" | "warn" | "error", msg: string, fields?: Record<string, unknown>) => void;
    }
  }
}

function routeLabel(req: Request): string {
  if (req.route?.path != null) {
    const base = req.baseUrl || "";
    return `${base}${req.route.path}`;
  }
  // Avoid high-cardinality raw URLs with ids
  const p = req.path || req.url.split("?")[0] || "/";
  if (p.startsWith("/api/fixtures/") && p !== "/api/fixtures") return "/api/fixtures/:id";
  if (p.startsWith("/api/history/") && p !== "/api/history" && !p.endsWith("/insights")) {
    return "/api/history/:id";
  }
  return p;
}

/** D8 — assign requestId, time request, emit HTTP metrics + access log. */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id")?.trim();
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  req.log = (level, msg, fields = {}) => {
    log(level, msg, { requestId, ...fields });
  };

  const started = Date.now();
  res.on("finish", () => {
    const route = routeLabel(req);
    const status = res.statusCode;
    observeHttp(req.method, route, status);
    // Skip noisy health polls at info — still counted in metrics
    if (route === "/api/health" || route === "/api/metrics") return;
    log(status >= 500 ? "error" : "info", "http_request", {
      requestId,
      method: req.method,
      route,
      status,
      latencyMs: Date.now() - started,
    });
  });

  next();
}

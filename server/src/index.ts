import "./lib/secrets.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { getDbInfo, initDb } from "./db/client.js";
import { aiServiceHealth, getAiServiceUrl } from "./lib/aiClient.js";
import { listFixtures, readFixture } from "./lib/fixtures.js";
import { requireAuth } from "./lib/auth.js";
import { cacheGet, cacheSet } from "./lib/diagCache.js";
import { hashLog, saveDiagnosisRun } from "./lib/history.js";
import { enqueue } from "./lib/jobQueue.js";
import { log, PROMPT_VERSION } from "./lib/logger.js";
import { getMetricsSnapshot, observeDiagnose } from "./lib/metrics.js";
import { runDiagnose } from "./lib/runDiagnose.js";
import { getServerEnvInfo, isLlmConfigured, redactSecrets } from "./lib/secrets.js";
import { requestContext } from "./middleware/requestContext.js";
import { agentRouter } from "./routes/agent.js";
import { authRouter } from "./routes/auth.js";
import { historyRouter } from "./routes/history.js";

const app = express();
const { port: PORT } = getServerEnvInfo();

// D5 — PaaS terminates TLS; trust X-Forwarded-* so secure cookies / IPs work
app.set("trust proxy", 1);

app.use(
  cors({
    origin: true,
    credentials: true, // allow browser to send/receive httpOnly session cookie
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
// D8 — requestId + HTTP metrics + JSON access logs
app.use(requestContext);

app.get("/api/health", async (_req, res) => {
  const aiUrl = getAiServiceUrl();
  const ai = aiUrl ? await aiServiceHealth(aiUrl) : null;
  const dbInfo = getDbInfo();
  let historyDb = false;
  try {
    await initDb();
    historyDb = true;
  } catch {
    historyDb = false;
  }
  res.json({
    status: "ok",
    service: "loglens-server",
    phase: "A4",
    llmConfigured: isLlmConfigured(),
    auth: "cookie-jwt",
    historyDb,
    db: dbInfo,
    promptVersion: PROMPT_VERSION,
    aiService: aiUrl
      ? { url: aiUrl, ok: ai?.ok ?? false, detail: ai?.detail ?? null }
      : { configured: false },
  });
});

/** D8 / A3b — scrape latency, errors, ungrounded (ragWeak) rate */
app.get("/api/metrics", (_req, res) => {
  res.json(getMetricsSnapshot());
});

app.use("/api/auth", authRouter);
app.use("/api/history", historyRouter);
app.use("/api/agent", agentRouter);

app.get("/api/fixtures", requireAuth, (_req, res) => {
  res.json(listFixtures());
});

app.get("/api/fixtures/:id", requireAuth, (req, res) => {
  const text = readFixture(String(req.params.id));
  if (text == null) {
    res.status(404).json({ error: "fixture not found" });
    return;
  }
  res.json({ id: req.params.id, text });
});

app.post("/api/diagnose", requireAuth, async (req, res) => {
  const requestId = req.requestId ?? "unknown";
  try {
    const { logText, fixtureId, mode } = req.body as {
      logText?: string;
      fixtureId?: string;
      mode?: string;
    };
    const text = logText ?? "";
    const userId = req.user!.id;
    const logHash = hashLog(text);

    const cached = text.trim() ? cacheGet(userId, logHash) : null;
    if (cached) {
      observeDiagnose({
        ok: true,
        fromCache: true,
        latencyMs: 0,
        ragWeak: cached.response.meta.ragWeak,
        needsHumanReview: cached.response.diagnosis.needsHumanReview,
      });
      log("info", "diagnose", {
        requestId,
        runId: cached.runId,
        fromCache: true,
        ragWeak: cached.response.meta.ragWeak,
        provider: cached.response.diagnosis.provider,
        brain: cached.response.meta.brain,
      });
      res.json({
        ...cached.response,
        meta: {
          ...cached.response.meta,
          runId: cached.runId,
          fromCache: true,
          latencyMs: 0,
        },
      });
      return;
    }

    const response = await runDiagnose({
      logText: text,
      fixtureId,
      mode,
      requestId,
    });

    let runId: string | null = null;
    try {
      runId = await saveDiagnosisRun({
        userId,
        logText: text,
        fixtureId,
        response,
      });
      cacheSet(userId, logHash, runId, response);
      enqueue({
        type: "audit_log",
        userId,
        runId,
        provider: response.diagnosis.provider,
        at: new Date().toISOString(),
      });
    } catch (persistErr) {
      log("error", "history_save_failed", {
        requestId,
        err: persistErr instanceof Error ? persistErr.message : "save failed",
      });
    }

    observeDiagnose({
      ok: true,
      fromCache: false,
      latencyMs: response.meta.latencyMs,
      ragWeak: response.meta.ragWeak,
      needsHumanReview: response.diagnosis.needsHumanReview,
    });
    log("info", "diagnose", {
      requestId,
      runId,
      fromCache: false,
      latencyMs: response.meta.latencyMs,
      ragWeak: response.meta.ragWeak,
      needsHumanReview: response.diagnosis.needsHumanReview,
      provider: response.diagnosis.provider,
      brain: response.meta.brain,
      // never log logText / secrets
      logChars: text.length,
      fixtureId: fixtureId ?? null,
    });

    res.json({
      ...response,
      meta: { ...response.meta, runId, fromCache: false },
    });
  } catch (err) {
    observeDiagnose({ ok: false, latencyMs: 0 });
    const message = err instanceof Error ? err.message : "diagnose failed";
    log("error", "diagnose_failed", { requestId, err: message });
    res.status(502).json({
      error: redactSecrets(message),
      hint: "Set OPENAI_API_KEY in server/.env (see SECRETS.md) or use mode=mock / DIAGNOSE_MODE=auto",
      requestId,
    });
  }
});

const boot = await initDb().catch((err) => {
  log("error", "db_init_failed", { err });
  process.exit(1);
});

app.listen(PORT, () => {
  const info = getServerEnvInfo();
  const aiUrl = getAiServiceUrl();
  log("info", "api_listen", {
    port: PORT,
    llmConfigured: info.llmConfigured,
    aiService: aiUrl ?? null,
    dbEngine: boot.engine,
    promptVersion: PROMPT_VERSION,
  });
  console.log(`LogLens API  http://127.0.0.1:${PORT}`);
  console.log(`Health       http://127.0.0.1:${PORT}/api/health`);
  console.log(`Metrics      http://127.0.0.1:${PORT}/api/metrics`);
  console.log(
    `LLM key      ${info.llmConfigured ? "configured (value not printed)" : "not set — mock/auto without key"}`,
  );
  console.log(
    `AI brain     ${aiUrl ? aiUrl : "in-process node-local (set AI_SERVICE_URL for Python)"}`,
  );
  console.log("Auth         signup/login cookie session (diagnose requires login)");
  console.log(`History DB   ${boot.engine} · ${boot.label}`);
});

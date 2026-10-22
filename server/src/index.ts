import "./lib/secrets.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { getDb, getDbPath } from "./db/client.js";
import { aiServiceHealth, getAiServiceUrl } from "./lib/aiClient.js";
import { listFixtures, readFixture } from "./lib/fixtures.js";
import { requireAuth } from "./lib/auth.js";
import { cacheGet, cacheSet } from "./lib/diagCache.js";
import { hashLog, saveDiagnosisRun } from "./lib/history.js";
import { enqueue } from "./lib/jobQueue.js";
import { runDiagnose } from "./lib/runDiagnose.js";
import { getServerEnvInfo, isLlmConfigured, redactSecrets } from "./lib/secrets.js";
import { authRouter } from "./routes/auth.js";
import { historyRouter } from "./routes/history.js";

// Open SQLite + migrations at boot (DATA-0)
try {
  getDb();
} catch (err) {
  console.error("SQLite init failed:", err);
}

const app = express();
const { port: PORT } = getServerEnvInfo();

app.use(
  cors({
    origin: true,
    credentials: true, // allow browser to send/receive httpOnly session cookie
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/api/health", async (_req, res) => {
  const aiUrl = getAiServiceUrl();
  const ai = aiUrl ? await aiServiceHealth(aiUrl) : null;
  let historyDb = false;
  try {
    getDb();
    historyDb = true;
  } catch {
    historyDb = false;
  }
  res.json({
    status: "ok",
    service: "loglens-server",
    phase: "DATA-0",
    llmConfigured: isLlmConfigured(),
    auth: "cookie-jwt",
    historyDb,
    aiService: aiUrl
      ? { url: aiUrl, ok: ai?.ok ?? false, detail: ai?.detail ?? null }
      : { configured: false },
  });
});

app.use("/api/auth", authRouter);
app.use("/api/history", historyRouter);

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
    });

    let runId: string | null = null;
    try {
      runId = saveDiagnosisRun({
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
      console.error("history save failed:", persistErr);
    }

    res.json({
      ...response,
      meta: { ...response.meta, runId, fromCache: false },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "diagnose failed";
    res.status(502).json({
      error: redactSecrets(message),
      hint: "Set OPENAI_API_KEY in server/.env (see SECRETS.md) or use mode=mock / DIAGNOSE_MODE=auto",
    });
  }
});

app.listen(PORT, () => {
  const info = getServerEnvInfo();
  const aiUrl = getAiServiceUrl();
  console.log(`LogLens API  http://127.0.0.1:${PORT}`);
  console.log(`Health       http://127.0.0.1:${PORT}/api/health`);
  console.log(
    `LLM key      ${info.llmConfigured ? "configured (value not printed)" : "not set — mock/auto without key"}`,
  );
  console.log(
    `AI brain     ${aiUrl ? aiUrl : "in-process node-local (set AI_SERVICE_URL for Python)"}`,
  );
  console.log("Auth         signup/login cookie session (diagnose requires login)");
  console.log(`History DB   ${getDbPath()}`);
});

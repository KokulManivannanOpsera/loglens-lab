import "dotenv/config";
import cors from "cors";
import express from "express";
import { listFixtures, readFixture } from "./lib/fixtures.js";
import { runDiagnose } from "./lib/runDiagnose.js";

const app = express();
const PORT = Number(process.env.PORT || 8091);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "loglens-server",
    phase: "A1-split",
    llmConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
  });
});

app.get("/api/fixtures", (_req, res) => {
  res.json(listFixtures());
});

app.get("/api/fixtures/:id", (req, res) => {
  const text = readFixture(req.params.id);
  if (text == null) {
    res.status(404).json({ error: "fixture not found" });
    return;
  }
  res.json({ id: req.params.id, text });
});

app.post("/api/diagnose", async (req, res) => {
  try {
    const { logText, fixtureId, mode } = req.body as {
      logText?: string;
      fixtureId?: string;
      mode?: string;
    };
    const response = await runDiagnose({
      logText: logText ?? "",
      fixtureId,
      mode,
    });
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "diagnose failed";
    res.status(502).json({
      error: message,
      hint: "Set OPENAI_API_KEY or use mode=mock / DIAGNOSE_MODE=auto",
    });
  }
});

app.listen(PORT, () => {
  console.log(`LogLens API  http://127.0.0.1:${PORT}`);
  console.log(`Health       http://127.0.0.1:${PORT}/api/health`);
});

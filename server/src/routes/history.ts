import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import {
  getHistoryDetail,
  getInsights,
  listHistory,
} from "../lib/history.js";

export const historyRouter = Router();

historyRouter.use(requireAuth);

/** List recent runs for the signed-in user (optional ?q= full-text search). */
historyRouter.get("/", (req, res) => {
  const userId = req.user!.id;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const limit =
    typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
  try {
    const items = listHistory(userId, { q, limit });
    res.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "history list failed";
    res.status(500).json({ error: message });
  }
});

/** Aggregate insights for the Insights UI (BI-lite). */
historyRouter.get("/insights", (req, res) => {
  const userId = req.user!.id;
  try {
    res.json(getInsights(userId));
  } catch (err) {
    const message = err instanceof Error ? err.message : "insights failed";
    res.status(500).json({ error: message });
  }
});

historyRouter.get("/:id", (req, res) => {
  const userId = req.user!.id;
  const detail = getHistoryDetail(userId, String(req.params.id));
  if (!detail) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(detail);
});

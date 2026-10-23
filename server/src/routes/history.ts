import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { saveFeedback, type FeedbackRating } from "../lib/feedback.js";
import {
  getHistoryDetail,
  getInsights,
  listHistory,
} from "../lib/history.js";

export const historyRouter = Router();

historyRouter.use(requireAuth);

/** List recent runs for the signed-in user (optional ?q= full-text search). */
historyRouter.get("/", async (req, res) => {
  const userId = req.user!.id;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const limit =
    typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
  try {
    const items = await listHistory(userId, { q, limit });
    res.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "history list failed";
    res.status(500).json({ error: message });
  }
});

/** Aggregate insights for the Insights UI (BI-lite). */
historyRouter.get("/insights", async (req, res) => {
  const userId = req.user!.id;
  try {
    res.json(await getInsights(userId));
  } catch (err) {
    const message = err instanceof Error ? err.message : "insights failed";
    res.status(500).json({ error: message });
  }
});

/**
 * A3c — thumbs up/down on a saved diagnosis.
 * Body: { rating: "up" | "down", note?: string }
 * Down → append server/evals/feedback-candidates.jsonl (manual promote to goldens).
 */
historyRouter.post("/:id/feedback", async (req, res) => {
  const userId = req.user!.id;
  const runId = String(req.params.id);
  const { rating, note } = req.body as {
    rating?: string;
    note?: string;
  };
  if (rating !== "up" && rating !== "down") {
    res.status(400).json({ error: 'rating must be "up" or "down"' });
    return;
  }
  try {
    const feedback = await saveFeedback({
      userId,
      runId,
      rating: rating as FeedbackRating,
      note,
    });
    res.json({
      ok: true,
      feedback,
      evalCandidate:
        rating === "down"
          ? "appended to evals/feedback-candidates.jsonl — promote to goldens.json manually"
          : null,
    });
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status)
        : 500;
    const message = err instanceof Error ? err.message : "feedback failed";
    res.status(status || 500).json({ error: message });
  }
});

historyRouter.get("/:id", async (req, res) => {
  const userId = req.user!.id;
  try {
    const detail = await getHistoryDetail(userId, String(req.params.id));
    if (!detail) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : "history detail failed";
    res.status(500).json({ error: message });
  }
});

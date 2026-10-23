import { Router } from "express";
import { recordApproval } from "../lib/agent.js";
import { requireAuth } from "../lib/auth.js";
import { log } from "../lib/logger.js";

export const agentRouter = Router();

agentRouter.use(requireAuth);

/**
 * A4b — human approve/reject a pending write tool (shadow by default).
 * Body: { toolCallId, approved, draft? }
 */
agentRouter.post("/approve", (req, res) => {
  const { toolCallId, approved, draft } = req.body as {
    toolCallId?: string;
    approved?: boolean;
    draft?: Record<string, unknown>;
  };
  if (!toolCallId || typeof approved !== "boolean") {
    res.status(400).json({ error: "toolCallId and approved (boolean) required" });
    return;
  }
  const result = recordApproval({
    toolCallId,
    approved,
    actorUserId: req.user!.id,
    draft: draft && typeof draft === "object" ? draft : {},
  });
  log("info", "agent_approval", {
    requestId: req.requestId,
    toolCallId,
    approved,
    userId: req.user!.id,
    executed: result.executed,
  });
  res.json(result);
});

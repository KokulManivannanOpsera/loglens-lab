/**
 * A4 / A4b — Node-local light agent (mirrors Python allowlist when AI service is off).
 */
import { randomUUID } from "crypto";
import { retrieveRunbooksAsync } from "./rag.js";

const MAX_STEPS = 3;

export const TOOL_SEARCH_RUNBOOK = "search_runbook";
export const TOOL_GREP_LOG = "grep_log";
export const TOOL_CREATE_TICKET_DRAFT = "create_ticket_draft";

const READ_TOOLS = new Set([TOOL_SEARCH_RUNBOOK, TOOL_GREP_LOG]);
const WRITE_TOOLS = new Set([TOOL_CREATE_TICKET_DRAFT]);
export const AGENT_ALLOWLIST = new Set([...READ_TOOLS, ...WRITE_TOOLS]);

const REFUSE = [
  { re: /\b(rm\s+-rf|delete\s+prod|drop\s+database)\b/i, name: "destructive" },
  {
    re: /\b(auto[- ]?deploy|deploy\s+to\s+prod(uction)?\s+now)\b/i,
    name: "auto-prod-deploy",
  },
  { re: /\b(merge\s+without\s+review|skip\s+ci)\b/i, name: "bypass-gates" },
];

export type AgentToolCall = {
  id: string;
  step: number;
  tool: string;
  args: Record<string, unknown>;
  reason?: string;
  sideEffect: "read" | "write";
  result: Record<string, unknown>;
};

export type AgentMeta = {
  enabled: boolean;
  maxSteps: number;
  allowlist: string[];
  refusedSignals: string[];
  toolCalls: AgentToolCall[];
  pendingApprovals: {
    id: string;
    tool: string;
    draft: Record<string, unknown>;
    status: string;
  }[];
  shadowMode: boolean;
  note: string;
};

export function refuseUnsafe(text: string): string[] {
  return REFUSE.filter((r) => r.re.test(text)).map((r) => r.name);
}

function grepLog(logText: string, pattern: string): Record<string, unknown> {
  let rx: RegExp;
  try {
    rx = new RegExp(pattern, "i");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "bad pattern",
      hits: [],
    };
  }
  const hits: string[] = [];
  for (const [i, line] of logText.split(/\r?\n/).entries()) {
    if (rx.test(line)) {
      hits.push(`L${i + 1}: ${line.trim().slice(0, 240)}`);
      if (hits.length >= 8) break;
    }
  }
  return { ok: true, pattern, hits, hitCount: hits.length };
}

function ticketDraft(summary: string, body: string): Record<string, unknown> {
  return {
    ok: true,
    status: "pending_approval",
    dryRun: true,
    draft: {
      title: summary.slice(0, 160),
      body: body.slice(0, 2000),
      destination: "shadow://ticket-draft",
    },
    message:
      "Draft only — approve in UI to acknowledge (still no external write by default).",
  };
}

/** In-memory audit of approvals (process-local). */
const approvalAudit: {
  at: string;
  toolCallId: string;
  approved: boolean;
  actorUserId: string;
  draft: Record<string, unknown>;
  executed: boolean;
}[] = [];

export function listApprovalAudit(): typeof approvalAudit {
  return [...approvalAudit];
}

export function recordApproval(input: {
  toolCallId: string;
  approved: boolean;
  actorUserId: string;
  draft: Record<string, unknown>;
}): { ok: boolean; executed: boolean; message: string } {
  const executeWrites =
    (process.env.AGENT_EXECUTE_WRITES || "").toLowerCase() === "true";
  // Lab default: never call external systems even when approved
  const executed = false;
  approvalAudit.push({
    at: new Date().toISOString(),
    toolCallId: input.toolCallId,
    approved: input.approved,
    actorUserId: input.actorUserId,
    draft: input.draft,
    executed,
  });
  if (!input.approved) {
    return { ok: true, executed: false, message: "Rejected — no side effects." };
  }
  if (!executeWrites) {
    return {
      ok: true,
      executed: false,
      message:
        "Approved in shadow mode — audit recorded; AGENT_EXECUTE_WRITES not enabled (no external write).",
    };
  }
  return {
    ok: true,
    executed: false,
    message: "AGENT_EXECUTE_WRITES is reserved — lab still does not call Jira/GitHub.",
  };
}

export async function runNodeAgent(logText: string): Promise<AgentMeta> {
  const refusedSignals = refuseUnsafe(logText);
  const toolCalls: AgentToolCall[] = [];
  const pendingApprovals: AgentMeta["pendingApprovals"] = [];

  const plan: { tool: string; args: Record<string, unknown>; reason: string }[] =
    [
      {
        tool: TOOL_GREP_LOG,
        args: {
          pattern: "AssertionError|Error:|FAIL|Exception|Timeout|ETIMEDOUT",
        },
        reason: "Find error lines in the log",
      },
      {
        tool: TOOL_SEARCH_RUNBOOK,
        args: { query: logText.slice(0, 400) },
        reason: "Retrieve matching runbooks",
      },
    ];

  if (
    /FAIL|Error|Exception|Timeout/i.test(logText) &&
    refusedSignals.length === 0
  ) {
    plan.push({
      tool: TOOL_CREATE_TICKET_DRAFT,
      args: {
        summary: "CI failure — LogLens draft",
        body: `Auto-draft from LogLens agent (needs human approve).\n\nPreview:\n${logText.slice(0, 800)}`,
      },
      reason: "Draft a ticket for humans (no auto-write)",
    });
  }

  for (const [i, step] of plan.slice(0, MAX_STEPS).entries()) {
    const id = randomUUID();
    let result: Record<string, unknown>;
    if (step.tool === TOOL_GREP_LOG) {
      result = grepLog(logText, String(step.args.pattern));
    } else if (step.tool === TOOL_SEARCH_RUNBOOK) {
      const rag = await retrieveRunbooksAsync(String(step.args.query || logText));
      result = {
        ok: true,
        weak: rag.weak,
        hits: rag.hits.slice(0, 5).map((h) => ({
          source: h.source,
          score: h.score,
          excerpt: h.text.slice(0, 220),
        })),
      };
    } else if (step.tool === TOOL_CREATE_TICKET_DRAFT) {
      result = ticketDraft(
        String(step.args.summary || "LogLens"),
        String(step.args.body || ""),
      );
    } else {
      result = { ok: false, error: "not allowlisted", refused: true };
    }

    const call: AgentToolCall = {
      id,
      step: i + 1,
      tool: step.tool,
      args: step.args,
      reason: step.reason,
      sideEffect: WRITE_TOOLS.has(step.tool) ? "write" : "read",
      result,
    };
    toolCalls.push(call);
    if (
      step.tool === TOOL_CREATE_TICKET_DRAFT &&
      result.status === "pending_approval"
    ) {
      pendingApprovals.push({
        id,
        tool: step.tool,
        draft: (result.draft as Record<string, unknown>) || {},
        status: "pending_approval",
      });
    }
  }

  return {
    enabled: true,
    maxSteps: MAX_STEPS,
    allowlist: [...AGENT_ALLOWLIST].sort(),
    refusedSignals,
    toolCalls,
    pendingApprovals,
    shadowMode: true,
    note: "Write tools are dry-run only until explicitly approved; still no external side effects by default.",
  };
}

export function enrichDiagnosisWithAgent<
  T extends {
    evidence: string[];
    needsHumanReview: boolean;
    summary: string;
  },
>(diagnosis: T, agent: AgentMeta): T {
  const evidence = [...diagnosis.evidence];
  for (const call of agent.toolCalls) {
    if (call.tool === TOOL_GREP_LOG) {
      const hits = (call.result.hits as string[]) || [];
      for (const h of hits.slice(0, 3)) evidence.push(`tool:grep_log:${h.slice(0, 120)}`);
    }
    if (call.tool === TOOL_SEARCH_RUNBOOK) {
      const hits = (call.result.hits as { source?: string }[]) || [];
      for (const h of hits) {
        if (h.source) evidence.push(`tool:search_runbook:${h.source}`);
      }
    }
  }
  const seen = new Set<string>();
  const deduped = evidence.filter((e) => (seen.has(e) ? false : (seen.add(e), true)));
  let summary = diagnosis.summary;
  let needs = diagnosis.needsHumanReview || agent.pendingApprovals.length > 0;
  if (agent.refusedSignals.length) {
    summary = `${summary} (agent refused unsafe intent: ${agent.refusedSignals.join(", ")})`;
    needs = true;
  }
  return {
    ...diagnosis,
    evidence: deduped.slice(0, 12),
    needsHumanReview: needs,
    summary,
  };
}

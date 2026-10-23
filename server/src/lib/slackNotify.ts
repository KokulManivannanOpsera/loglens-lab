/**
 * BRING — Chat / on-call light: Slack Incoming Webhook.
 * Fire-and-forget; never blocks diagnose. No-op without SLACK_WEBHOOK_URL.
 */
import { log } from "./logger.js";

export type SlackNotifyInput = {
  kind: "needs_review" | "diagnose_failed";
  requestId?: string;
  runId?: string | null;
  summary?: string;
  provider?: string;
  error?: string;
};

export function isSlackConfigured(): boolean {
  return Boolean(process.env.SLACK_WEBHOOK_URL?.trim());
}

export async function notifySlack(input: SlackNotifyInput): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!url) return;

  const lines =
    input.kind === "needs_review"
      ? [
          "*LogLens* — diagnosis needs human review",
          input.summary ? `> ${input.summary.slice(0, 200)}` : null,
          input.provider ? `provider: \`${input.provider}\`` : null,
          input.runId ? `runId: \`${input.runId}\`` : null,
          input.requestId ? `requestId: \`${input.requestId}\`` : null,
        ]
      : [
          "*LogLens* — diagnose failed",
          input.error ? `> ${input.error.slice(0, 200)}` : null,
          input.requestId ? `requestId: \`${input.requestId}\`` : null,
        ];

  const text = lines.filter(Boolean).join("\n");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      log("warn", "slack_notify_failed", {
        status: res.status,
        kind: input.kind,
      });
    }
  } catch (err) {
    log("warn", "slack_notify_failed", {
      kind: input.kind,
      err: err instanceof Error ? err.message : "slack error",
    });
  }
}

/** Non-blocking wrapper for route handlers. */
export function notifySlackBackground(input: SlackNotifyInput): void {
  void notifySlack(input);
}

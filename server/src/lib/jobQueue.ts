/**
 * DATA-0 — queue / stream role (in-process).
 * Real RabbitMQ/SQS later; here a tiny FIFO so “async work after diagnose” is real.
 * Jobs: audit_log (append-only file) — does not block the HTTP response path when enqueued.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

type Job =
  | {
      type: "audit_log";
      userId: string;
      runId: string;
      provider: string;
      at: string;
    };

const queue: Job[] = [];
let pumping = false;

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export function enqueue(job: Job): void {
  queue.push(job);
  void pump();
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) break;
      await handle(job);
    }
  } finally {
    pumping = false;
  }
}

async function handle(job: Job): Promise<void> {
  if (job.type === "audit_log") {
    const dir = path.join(serverRoot, "data");
    fs.mkdirSync(dir, { recursive: true });
    const line =
      JSON.stringify({
        type: "diagnosis_saved",
        userId: job.userId,
        runId: job.runId,
        provider: job.provider,
        at: job.at,
      }) + "\n";
    await fs.promises.appendFile(path.join(dir, "audit.jsonl"), line, "utf8");
  }
}

export function queueDepth(): number {
  return queue.length;
}

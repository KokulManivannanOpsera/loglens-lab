/** Soft budget so we don't blow the model context window. */
export const MAX_LOG_CHARS = 12_000;

const HEAD_BUDGET = 2_500;
const TAIL_BUDGET = 3_500;
/** Markers + separators between sections. */
const OVERHEAD = 280;

/** Lines that usually carry the real failure signal. */
const ERROR_PATTERNS: RegExp[] = [
  /AssertionError/i,
  /\bFAIL(ED|ING)?\b/i,
  /\bError:/i,
  /expected .+ to (equal|be|deep)/i,
  /ETIMEDOUT/i,
  /Timeout of \d+ms/i,
  /npm ERR!/i,
  /##\[error\]/i,
  /Process completed with exit code [1-9]/i,
  /log artifact not found/i,
  /Skipping log download/i,
  /\b404\b/,
  /\d+ failing\b/i,
];

export type TruncateStrategy = "none" | "head-tail" | "error-aware";

export type TruncateResult = {
  text: string;
  truncated: boolean;
  strategy: TruncateStrategy;
  /** How many log lines fell inside kept error windows (0 if none / not truncated). */
  keptErrorLines: number;
};

type LineRange = { start: number; end: number };

function isErrorLine(line: string): boolean {
  return ERROR_PATTERNS.some((p) => p.test(line));
}

function mergeRanges(ranges: LineRange[]): LineRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: LineRange[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = merged[merged.length - 1];
    if (cur.start <= last.end + 1) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

function headTail(trimmed: string): TruncateResult {
  const head = trimmed.slice(0, HEAD_BUDGET);
  const tail = trimmed.slice(-TAIL_BUDGET);
  return {
    text: `${head}\n\n...[truncated middle for context window]...\n\n${tail}`,
    truncated: true,
    strategy: "head-tail",
    keptErrorLines: 0,
  };
}

/**
 * A1b: keep head (setup) + error windows (failure signal) + tail (exit).
 * Falls back to head+tail when no error-like lines are found.
 */
export function truncateLog(logText: string): TruncateResult {
  const trimmed = logText.trim();
  if (trimmed.length <= MAX_LOG_CHARS) {
    return {
      text: trimmed,
      truncated: false,
      strategy: "none",
      keptErrorLines: 0,
    };
  }

  const lines = trimmed.split("\n");
  const errorIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isErrorLine(lines[i])) errorIdx.push(i);
  }

  if (errorIdx.length === 0) {
    return headTail(trimmed);
  }

  const windows = mergeRanges(
    errorIdx.map((i) => ({
      start: Math.max(0, i - 3),
      end: Math.min(lines.length - 1, i + 5),
    })),
  );

  const errorBudget = Math.max(
    1_500,
    MAX_LOG_CHARS - HEAD_BUDGET - TAIL_BUDGET - OVERHEAD,
  );

  const errorChunks: string[] = [];
  let errorChars = 0;
  let keptErrorLines = 0;

  for (const range of windows) {
    const chunk = lines.slice(range.start, range.end + 1).join("\n");
    const lineCount = range.end - range.start + 1;
    if (errorChars + chunk.length > errorBudget) {
      if (errorChars === 0) {
        errorChunks.push(chunk.slice(0, errorBudget));
        keptErrorLines += lineCount;
        errorChars = errorBudget;
      }
      break;
    }
    errorChunks.push(chunk);
    errorChars += chunk.length + 20;
    keptErrorLines += lineCount;
  }

  if (errorChunks.length === 0) {
    return headTail(trimmed);
  }

  const head = trimmed.slice(0, HEAD_BUDGET);
  const tail = trimmed.slice(-TAIL_BUDGET);
  const mid = errorChunks.join("\n\n...[snip between errors]...\n\n");

  let text = [
    head,
    "",
    "...[truncated; kept error windows for context]...",
    "",
    mid,
    "",
    "...[truncated; end of log]...",
    "",
    tail,
  ].join("\n");

  if (text.length > MAX_LOG_CHARS) {
    text = `${text.slice(0, MAX_LOG_CHARS - 80)}\n\n...[hard cap]...`;
  }

  return {
    text,
    truncated: true,
    strategy: "error-aware",
    keptErrorLines,
  };
}

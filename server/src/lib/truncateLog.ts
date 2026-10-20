/** Soft limit so we don't blow the context window (full strategy = A1b). */
export const MAX_LOG_CHARS = 12_000;

export function truncateLog(logText: string): { text: string; truncated: boolean } {
  const trimmed = logText.trim();
  if (trimmed.length <= MAX_LOG_CHARS) {
    return { text: trimmed, truncated: false };
  }
  const head = trimmed.slice(0, 4_000);
  const tail = trimmed.slice(-7_000);
  return {
    text: `${head}\n\n...[truncated middle for context window]...\n\n${tail}`,
    truncated: true,
  };
}

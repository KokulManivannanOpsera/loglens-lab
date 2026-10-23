import type { ReactNode } from "react";

type Tone = "default" | "accent" | "warn" | "danger";

/** BRING — UI kit primitive (pill / badge). */
export function Badge({
  children,
  tone = "default",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span className={`ui-badge ui-badge-${tone} ${className}`.trim()}>
      {children}
    </span>
  );
}

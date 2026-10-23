import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger";
type Size = "default" | "sm";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

/** BRING — UI kit primitive (shadcn-shaped API, CSS-token styled). */
export function Button({
  variant = "primary",
  size = "default",
  className = "",
  children,
  type = "button",
  ...rest
}: Props) {
  const classes = [
    "ui-btn",
    `ui-btn-${variant}`,
    size === "sm" ? "ui-btn-sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}

import type { InputHTMLAttributes } from "react";

/** BRING — UI kit primitive. */
export function Input({
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-input ${className}`.trim()} {...rest} />;
}

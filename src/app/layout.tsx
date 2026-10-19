import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LogLens Lab",
  description: "CI log diagnosis — AI + DevOps learning lab",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

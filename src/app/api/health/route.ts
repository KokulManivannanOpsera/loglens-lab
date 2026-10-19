import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "loglens",
    phase: "A1",
    llmConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
  });
}

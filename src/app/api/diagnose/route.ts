import { NextResponse } from "next/server";
import { runDiagnose } from "@/lib/runDiagnose";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    logText?: string;
    fixtureId?: string;
    mode?: string;
  };

  try {
    const response = await runDiagnose({
      logText: body.logText ?? "",
      fixtureId: body.fixtureId,
      mode: body.mode,
    });
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "diagnose failed";
    return NextResponse.json(
      { error: message, hint: "Set OPENAI_API_KEY or use mode=mock / DIAGNOSE_MODE=auto" },
      { status: 502 },
    );
  }
}

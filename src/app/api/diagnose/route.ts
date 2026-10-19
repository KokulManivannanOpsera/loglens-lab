import { NextResponse } from "next/server";
import { mockDiagnose } from "@/lib/mockDiagnose";
import type { DiagnoseResponse } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as { logText?: string; fixtureId?: string };
  const logText = body.logText ?? "";

  const diagnosis = mockDiagnose(logText);
  const response: DiagnoseResponse = {
    diagnosis,
    meta: {
      logChars: logText.length,
      fixtureHint: body.fixtureId ?? null,
    },
  };

  return NextResponse.json(response);
}

import { NextResponse } from "next/server";
import { readFixture } from "@/lib/fixtures";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const text = readFixture(id);
  if (text == null) {
    return NextResponse.json({ error: "fixture not found" }, { status: 404 });
  }
  return NextResponse.json({ id, text });
}

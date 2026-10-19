import { NextResponse } from "next/server";
import { listFixtures } from "@/lib/fixtures";

export function GET() {
  return NextResponse.json(listFixtures());
}

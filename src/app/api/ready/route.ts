import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { env } from "@/server/config";
import { getPublicDemoReport } from "@/server/demo-service";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    if (env().DEMO_MODE) await getPublicDemoReport("full");
    return NextResponse.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "not_ready" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

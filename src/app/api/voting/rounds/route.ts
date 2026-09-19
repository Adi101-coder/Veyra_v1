import { NextResponse } from "next/server";
import { jsonError } from "@/server/http";
import { listRounds } from "@/server/voting/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const limit = Number.parseInt(new URL(request.url).searchParams.get("limit") ?? "30", 10);
    return NextResponse.json({ rounds: await listRounds(Number.isFinite(limit) ? limit : 30) });
  } catch (error) {
    return jsonError(error);
  }
}

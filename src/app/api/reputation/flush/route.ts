import { NextResponse } from "next/server";
import { processReputationJobs } from "@/server/betting/service";
import { jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const processed = await processReputationJobs();
    return NextResponse.json({ processed });
  } catch (error) {
    return jsonError(error);
  }
}

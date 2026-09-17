import { NextResponse } from "next/server";
import { requireOperatorOrCron } from "@/server/auth";
import { runWorkerTick } from "@/server/worker";
import { jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Background work is slower than a default serverless invocation allows. */
export const maxDuration = 60;

/** Operator/cron: one pass of every background job (see src/server/worker.ts). */
async function tick(request: Request) {
  try {
    requireOperatorOrCron(request);
    return NextResponse.json(await runWorkerTick());
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  return tick(request);
}

/** Vercel Cron only issues GET requests. */
export async function GET(request: Request) {
  return tick(request);
}

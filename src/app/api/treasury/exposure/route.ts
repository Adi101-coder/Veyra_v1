import { NextResponse } from "next/server";
import { requireWallet } from "@/server/auth";
import { getPrisma } from "@/server/db";
import { jsonError } from "@/server/http";
import { exposureFor } from "@/server/treasury/exposure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** This wallet's share of the omnibus Polymarket exposure, from recorded fills. */
export async function GET(request: Request) {
  try {
    const wallet = requireWallet(request);
    return NextResponse.json(await exposureFor(getPrisma(), wallet));
  } catch (error) {
    return jsonError(error);
  }
}

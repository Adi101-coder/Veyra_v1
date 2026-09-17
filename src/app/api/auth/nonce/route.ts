import { NextResponse } from "next/server";
import { createNonce } from "@/server/auth";
import { jsonError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    rateLimit(request, "auth-nonce", 20, 60_000);
    const body = (await request.json().catch(() => null)) as { walletAddress?: unknown } | null;
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "veyra";
    return NextResponse.json(await createNonce(body?.walletAddress, host));
  } catch (error) {
    return jsonError(error);
  }
}

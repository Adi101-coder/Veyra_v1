import { NextResponse } from "next/server";
import { sessionCookie, verifySignIn } from "@/server/auth";
import { jsonError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    rateLimit(request, "auth-verify", 20, 60_000);
    const body = await request.json().catch(() => null);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "veyra";
    const { walletAddress, token } = await verifySignIn(body, host);
    const response = NextResponse.json({ walletAddress });
    response.headers.append("set-cookie", sessionCookie(token));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}

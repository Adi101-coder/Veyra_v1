import { NextResponse } from "next/server";
import { clearedSessionCookie } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.append("set-cookie", clearedSessionCookie());
  return response;
}

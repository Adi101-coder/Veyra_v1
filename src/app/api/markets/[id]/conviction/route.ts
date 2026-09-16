import { NextResponse } from "next/server";
import { getMarketConviction } from "@/server/conviction/service";
import { jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const conviction = await getMarketConviction(id);
    return NextResponse.json(conviction);
  } catch (error) {
    return jsonError(error);
  }
}

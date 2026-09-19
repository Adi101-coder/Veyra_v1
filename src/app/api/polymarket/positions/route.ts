import { NextResponse } from "next/server";
import { fetchPolymarketPositions } from "@/lib/polymarket";

export const revalidate = 12;

const EVM = /^0x[a-fA-F0-9]{40}$/;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const user = params.get("walletAddress") ?? params.get("user");
  if (!user || !EVM.test(user)) {
    return NextResponse.json(
      { error: { code: "INVALID_ADDRESS", message: "Pass an EVM wallet as walletAddress." } },
      { status: 400 },
    );
  }
  try {
    const positions = await fetchPolymarketPositions(user, 50);
    return NextResponse.json({ source: "polymarket", walletAddress: user, positions });
  } catch (error) {
    return NextResponse.json(
      {
        source: "error",
        walletAddress: user,
        positions: [],
        error: error instanceof Error ? error.message : "Polymarket positions unavailable",
      },
      { status: 502 },
    );
  }
}

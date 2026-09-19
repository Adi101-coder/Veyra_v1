import { NextResponse } from "next/server";
import { requireOperator } from "@/server/auth";
import { getPrisma } from "@/server/db";
import { jsonError } from "@/server/http";
import { fundBalances, seedFund } from "@/server/pools/fund";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const serialise = (value: bigint) => value.toString();

/** Fund total, what open pools have reserved, and the unallocated reserve. */
export async function GET(request: Request) {
  try {
    requireOperator(request);
    const prisma = getPrisma();
    const balances = await fundBalances(prisma);
    const pools = await prisma.poolLiquidity.findMany({
      where: { status: "ACTIVE" },
      orderBy: { openedAt: "desc" },
    });
    return NextResponse.json({
      fund: {
        totalMicros: serialise(balances.totalMicros),
        allocatedMicros: serialise(balances.allocatedMicros),
        reserveMicros: serialise(balances.reserveMicros),
      },
      pools: pools.map((pool) => ({
        marketId: pool.marketId,
        bMicros: serialise(pool.bMicros),
        maxLossMicros: serialise(pool.allocatedMicros),
        feeBps: pool.feeBps,
        openedAt: pool.openedAt.toISOString(),
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

/** Adds operator capital to the fund. Idempotent per reference. */
export async function POST(request: Request) {
  try {
    requireOperator(request);
    const body = (await request.json()) as { amountMicros?: unknown; reference?: unknown; memo?: unknown };
    const amount = typeof body.amountMicros === "string" ? body.amountMicros.trim() : "";
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";
    if (!/^\d+$/.test(amount) || !reference) {
      return NextResponse.json(
        { error: { code: "INVALID_SEED", message: "amountMicros (integer string) and reference are required." } },
        { status: 400 },
      );
    }
    const result = await seedFund(
      getPrisma(),
      BigInt(amount),
      reference,
      typeof body.memo === "string" ? body.memo : undefined,
    );
    const balances = await fundBalances(getPrisma());
    return NextResponse.json({ ...result, totalMicros: serialise(balances.totalMicros) });
  } catch (error) {
    return jsonError(error);
  }
}

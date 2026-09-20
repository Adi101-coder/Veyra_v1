import { NextResponse } from "next/server";
import { requireOperator } from "@/server/auth";
import { getPrisma } from "@/server/db";
import { jsonError } from "@/server/http";
import { accountingSeparationReport } from "@/server/treasury/exposure";
import { auditBalances } from "@/server/treasury/ledger";
import { lastOmnibusOnchain, readOmnibusOnchain } from "@/server/treasury/omnibus-onchain";
import { reconcileSolvency } from "@/server/treasury/solvency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only: wallet roles, per-ledger totals and a balance-vs-entries audit. */
export async function GET(request: Request) {
  try {
    requireOperator(request);
    const prisma = getPrisma();
    const [separation, audit, solvency, omnibusOnchain] = await Promise.all([
      accountingSeparationReport(prisma),
      auditBalances(prisma),
      reconcileSolvency(prisma),
      // Spread the cached snapshot first: this call's failure is the useful one, so
      // it must win. The other order let a stale (often null) error overwrite it,
      // leaving an operator looking at `error: null` on a read that just failed.
      readOmnibusOnchain().catch((error) => ({
        ...lastOmnibusOnchain(),
        error: error instanceof Error ? error.message : String(error),
      })),
    ]);
    return NextResponse.json({ ...separation, audit, solvency, omnibusOnchain });
  } catch (error) {
    return jsonError(error);
  }
}

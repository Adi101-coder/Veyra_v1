import { NextResponse } from "next/server";
import { requireOperator } from "@/server/auth";
import { getPrisma } from "@/server/db";
import { jsonError } from "@/server/http";
import { accountingSeparationReport } from "@/server/treasury/exposure";
import { auditBalances } from "@/server/treasury/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only: wallet roles, per-ledger totals and a balance-vs-entries audit. */
export async function GET(request: Request) {
  try {
    requireOperator(request);
    const prisma = getPrisma();
    const [separation, audit] = await Promise.all([
      accountingSeparationReport(prisma),
      auditBalances(prisma),
    ]);
    return NextResponse.json({ ...separation, audit });
  } catch (error) {
    return jsonError(error);
  }
}

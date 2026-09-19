import "server-only";

import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/server/db";
import { CASH_ASSET } from "@/server/treasury/funds";
import { auditBalances } from "@/server/treasury/ledger";

export type SolvencyFinding = {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
};

export type SolvencyReport = {
  ready: boolean;
  asset: string;
  userBalancesMicros: string;
  activeHoldsMicros: string;
  userClaimsMicros: string;
  houseCapitalMicros: string;
  controlledUsdcMicros: string | null;
  houseResidualMicros: string | null;
  audit: { checked: number; discrepancies: { walletAddress: string; asset: string }[] };
  findings: SolvencyFinding[];
};

function bigintEnv(env: NodeJS.ProcessEnv, name: string): bigint | null {
  const raw = (env[name] ?? "").trim();
  if (!/^\d+$/.test(raw)) return null;
  return BigInt(raw);
}

/**
 * Report-only cash solvency. Never writes an ADJUSTMENT.
 *
 * Invariant: user spendable + remaining ACTIVE holds + house capital = USDC
 * Veyra controls. Shortfall is an incident.
 */
export async function reconcileSolvency(
  prisma: PrismaClient = getPrisma(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<SolvencyReport> {
  const findings: SolvencyFinding[] = [];

  const [balances, holds, audit, simulatedPoolFills] = await Promise.all([
    prisma.treasuryBalance.aggregate({
      where: { asset: CASH_ASSET },
      _sum: { balanceBase: true },
    }),
    prisma.fundsHold.aggregate({
      where: { status: "ACTIVE" },
      _sum: { amountMicros: true, spentMicros: true },
    }),
    auditBalances(prisma),
    prisma.fill.count({ where: { isSimulated: true } }),
  ]);

  const userBalances = balances._sum.balanceBase ?? 0n;
  const activeHolds = (holds._sum.amountMicros ?? 0n) - (holds._sum.spentMicros ?? 0n);
  const userClaims = userBalances + activeHolds;
  const house = bigintEnv(env, "VEYRA_HOUSE_CAPITAL_MICROS") ?? 0n;
  const controlled =
    bigintEnv(env, "VEYRA_CONTROLLED_USDC_MICROS") ??
    (() => {
      const omnibus = bigintEnv(env, "VEYRA_OMNIBUS_USDC_BASELINE_MICROS");
      const treasury = bigintEnv(env, "VEYRA_TREASURY_USDC_MICROS");
      if (omnibus == null && treasury == null) return null;
      return (omnibus ?? 0n) + (treasury ?? 0n) + house;
    })();

  if (audit.discrepancies.length > 0) {
    findings.push({
      code: "LEDGER_MISMATCH",
      severity: "error",
      message: `${audit.discrepancies.length} wallet(s) have a balance that does not equal the sum of ledger entries.`,
    });
  }
  if (userBalances < 0n) {
    findings.push({
      code: "NEGATIVE_BALANCE",
      severity: "error",
      message: "A user USDC balance is negative.",
    });
  }
  if (simulatedPoolFills > 0) {
    findings.push({
      code: "SIMULATED_POOL_FILLS",
      severity: "warning",
      message:
        "Pool fills are marked simulated and are excluded from venue inventory. Include them before taking real pool cash.",
    });
  }
  if (controlled == null) {
    findings.push({
      code: "CONTROLLED_USDC_UNCONFIGURED",
      severity: "warning",
      message:
        "Set VEYRA_CONTROLLED_USDC_MICROS (or omnibus + treasury baselines) so solvency can compare claims to on-chain USDC.",
    });
  }

  let residual: bigint | null = null;
  if (controlled != null) {
    residual = controlled - userClaims - house;
    // User claims + configured house capital must be funded by controlled USDC.
    if (userClaims + house > controlled) {
      findings.push({
        code: "INSOLVENT",
        severity: "error",
        message: `User claims (${userClaims}) plus house capital (${house}) exceed controlled USDC (${controlled}).`,
      });
    }
  }

  return {
    ready: !findings.some((row) => row.severity === "error"),
    asset: CASH_ASSET,
    userBalancesMicros: userBalances.toString(),
    activeHoldsMicros: activeHolds.toString(),
    userClaimsMicros: userClaims.toString(),
    houseCapitalMicros: house.toString(),
    controlledUsdcMicros: controlled?.toString() ?? null,
    houseResidualMicros: residual?.toString() ?? null,
    audit: {
      checked: audit.checked,
      discrepancies: audit.discrepancies.map((row) => ({
        walletAddress: row.walletAddress,
        asset: row.asset,
      })),
    },
    findings,
  };
}

/** Accounting identity used by the invariant test. */
export async function custodyIdentity(prisma: PrismaClient) {
  const balances = await prisma.treasuryBalance.aggregate({
    where: { asset: CASH_ASSET },
    _sum: { balanceBase: true },
  });
  const active = await prisma.fundsHold.aggregate({
    where: { status: "ACTIVE" },
    _sum: { amountMicros: true, spentMicros: true },
  });
  const spent = await prisma.fundsHold.aggregate({
    where: { status: { in: ["SETTLED", "RELEASED"] } },
    _sum: { spentMicros: true },
  });
  const ledger = await prisma.treasuryLedgerEntry.groupBy({
    by: ["kind"],
    where: { asset: CASH_ASSET },
    _sum: { deltaBase: true },
  });
  const byKind = (kind: string) => ledger.find((row) => row.kind === kind)?._sum.deltaBase ?? 0n;
  return {
    balances: balances._sum.balanceBase ?? 0n,
    activeHolds: (active._sum.amountMicros ?? 0n) - (active._sum.spentMicros ?? 0n),
    settledSpent: spent._sum.spentMicros ?? 0n,
    deposits: byKind("DEPOSIT"),
    sellCredits: byKind("SELL_CREDIT"),
    payouts: byKind("PAYOUT"),
    fees: -byKind("FEE_DEBIT"),
    withdrawals: -byKind("WITHDRAWAL"),
    reversals: byKind("REVERSAL"),
  };
}

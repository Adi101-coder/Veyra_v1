import "server-only";

import type { PrismaClient } from "@prisma/client";
import { BettingError } from "@/server/errors";
import { isUniqueViolation, withUniqueRetry } from "@/server/prisma-retry";
import { assertWalletsAreSeparate, findAsset } from "@/server/treasury/config";

/**
 * Custodial ledger for the deposit/treasury wallet.
 *
 * Every balance change is an append-only entry plus a matching balance update in
 * one transaction. Nothing here can reach the Polymarket execution wallet: this
 * module never sees a private key and never calls the venue. Treasury accounting
 * and execution accounting are separate ledgers on purpose — a user's deposits are
 * their property, while venue exposure is tracked per prediction in Position/Fill.
 */

export type DepositInput = {
  walletAddress: string;
  asset: string;
  chainId: number;
  txHash: string;
  logIndex: number;
  amountBase: bigint;
  observedAt?: Date;
};

export type CreditResult = {
  /** False when this exact transfer was already credited. */
  credited: boolean;
  depositId: string;
  balanceBase: bigint;
};

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/**
 * Records a confirmed on-chain deposit and credits the user.
 *
 * Idempotent per (chainId, txHash, logIndex): a watcher that replays the same log,
 * or two workers seeing it at once, credit exactly once.
 */
export async function creditDeposit(
  prisma: PrismaClient,
  input: DepositInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CreditResult> {
  assertWalletsAreSeparate(env);
  if (!TX_HASH.test(input.txHash)) {
    throw new BettingError("INVALID_DEPOSIT", "txHash must be a 32-byte hex hash.", 400);
  }
  if (input.logIndex < 0 || !Number.isInteger(input.logIndex)) {
    throw new BettingError("INVALID_DEPOSIT", "logIndex must be a non-negative integer.", 400);
  }
  if (input.amountBase <= 0n) {
    throw new BettingError("INVALID_DEPOSIT", "Deposit amount must be positive.", 400);
  }
  const asset = findAsset(input.asset, env);
  if (!asset) {
    throw new BettingError("UNSUPPORTED_ASSET", `${input.asset} is not a supported deposit asset.`, 400);
  }
  if (asset.chainId !== input.chainId) {
    throw new BettingError("UNSUPPORTED_ASSET", `${asset.symbol} is not deposited on chain ${input.chainId}.`, 400);
  }

  const txHash = input.txHash.toLowerCase();
  const walletAddress = input.walletAddress.trim().toLowerCase();

  return withUniqueRetry(async () => {
    try {
      return await prisma.$transaction(async (tx) => {
        const deposit = await tx.treasuryDeposit.create({
          data: {
            walletAddress,
            asset: asset.symbol,
            chainId: input.chainId,
            txHash,
            logIndex: input.logIndex,
            amountBase: input.amountBase,
            decimals: asset.decimals,
            status: "CREDITED",
            observedAt: input.observedAt ?? new Date(),
          },
        });
        const balanceBase = await applyDelta(tx, {
          walletAddress,
          asset: asset.symbol,
          decimals: asset.decimals,
          deltaBase: input.amountBase,
          kind: "DEPOSIT",
          refType: "TreasuryDeposit",
          refId: deposit.id,
        });
        return { credited: true, depositId: deposit.id, balanceBase };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Already credited: report the existing state rather than crediting twice.
      const existing = await prisma.treasuryDeposit.findUnique({
        where: {
          chainId_txHash_logIndex: { chainId: input.chainId, txHash, logIndex: input.logIndex },
        },
      });
      if (!existing) throw error; // a different unique collided; let the retry handle it
      const balance = await prisma.treasuryBalance.findUnique({
        where: { walletAddress_asset: { walletAddress: existing.walletAddress, asset: existing.asset } },
      });
      return { credited: false, depositId: existing.id, balanceBase: balance?.balanceBase ?? 0n };
    }
  });
}

type LedgerTx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Writes one ledger entry and moves the balance by the same amount.
 *
 * The (refType, refId, kind) unique index means a cause can only move the balance
 * once, so a retried transaction cannot double-apply.
 */
async function applyDelta(
  tx: LedgerTx,
  entry: {
    walletAddress: string;
    asset: string;
    decimals: number;
    deltaBase: bigint;
    kind: string;
    refType: string;
    refId: string;
  },
) {
  await tx.treasuryLedgerEntry.create({
    data: {
      walletAddress: entry.walletAddress,
      asset: entry.asset,
      deltaBase: entry.deltaBase,
      decimals: entry.decimals,
      kind: entry.kind,
      refType: entry.refType,
      refId: entry.refId,
    },
  });
  // Debits cannot upsert: Postgres checks the INSERT row of ON CONFLICT before
  // applying the update, so a negative create value trips the non-negative CHECK
  // even when a funded row already exists.
  if (entry.deltaBase < 0n) {
    const updated = await tx.treasuryBalance.update({
      where: { walletAddress_asset: { walletAddress: entry.walletAddress, asset: entry.asset } },
      data: { balanceBase: { increment: entry.deltaBase } },
    });
    return updated.balanceBase;
  }
  const balance = await tx.treasuryBalance.upsert({
    where: { walletAddress_asset: { walletAddress: entry.walletAddress, asset: entry.asset } },
    create: {
      walletAddress: entry.walletAddress,
      asset: entry.asset,
      decimals: entry.decimals,
      balanceBase: entry.deltaBase,
    },
    update: { balanceBase: { increment: entry.deltaBase } },
  });
  return balance.balanceBase;
}

/** A user's custodial balances. Reads only; never touches the execution wallet. */
export async function balancesFor(prisma: PrismaClient, walletAddress: string) {
  const rows = await prisma.treasuryBalance.findMany({
    where: { walletAddress: walletAddress.toLowerCase() },
    orderBy: { asset: "asc" },
  });
  return rows.map((row) => ({
    asset: row.asset,
    balanceBase: row.balanceBase.toString(),
    decimals: row.decimals,
  }));
}

/**
 * Proves the ledger adds up: every balance must equal the sum of its entries.
 * Any row where they disagree is a bug, and is reported rather than corrected.
 */
export async function auditBalances(prisma: PrismaClient) {
  const balances = await prisma.treasuryBalance.findMany();
  const sums = await prisma.treasuryLedgerEntry.groupBy({
    by: ["walletAddress", "asset"],
    _sum: { deltaBase: true },
  });
  const sumByKey = new Map(sums.map((s) => [`${s.walletAddress}|${s.asset}`, s._sum.deltaBase ?? 0n]));

  const discrepancies = balances
    .map((row) => {
      const expected = sumByKey.get(`${row.walletAddress}|${row.asset}`) ?? 0n;
      return { walletAddress: row.walletAddress, asset: row.asset, recorded: row.balanceBase, expected };
    })
    .filter((row) => row.recorded !== row.expected)
    .map((row) => ({
      walletAddress: row.walletAddress,
      asset: row.asset,
      recordedBase: row.recorded.toString(),
      expectedBase: row.expected.toString(),
    }));

  return { checked: balances.length, discrepancies };
}

/**
 * Reverses a credited deposit whose on-chain transfer disappeared (reorg).
 * Debits the same amount, referenced by the deposit id, so a replay is a no-op.
 */
export async function reverseDeposit(prisma: PrismaClient, depositId: string) {
  const deposit = await prisma.treasuryDeposit.findUnique({ where: { id: depositId } });
  if (!deposit || deposit.status !== "CREDITED") {
    return { reversed: false };
  }
  const claim = await prisma.treasuryDeposit.updateMany({
    where: { id: deposit.id, status: "CREDITED" },
    data: { status: "REVERSED" },
  });
  if (claim.count !== 1) return { reversed: false };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "treasury_balances" WHERE "walletAddress" = ${deposit.walletAddress} AND "asset" = ${deposit.asset} FOR UPDATE`;
      const balance = await tx.treasuryBalance.findUnique({
        where: { walletAddress_asset: { walletAddress: deposit.walletAddress, asset: deposit.asset } },
      });
      if ((balance?.balanceBase ?? 0n) < deposit.amountBase) {
        throw new BettingError("INSUFFICIENT_FUNDS", "Balance does not cover reversing this deposit.", 402);
      }
      await applyDelta(tx, {
        walletAddress: deposit.walletAddress,
        asset: deposit.asset,
        decimals: deposit.decimals,
        deltaBase: -deposit.amountBase,
        kind: "REVERSAL",
        refType: "TreasuryDeposit",
        refId: `${deposit.id}:reorg`,
      });
    });
  } catch (error) {
    await prisma.treasuryDeposit.update({ where: { id: deposit.id }, data: { status: "CREDITED" } });
    throw error;
  }
  return { reversed: true };
}

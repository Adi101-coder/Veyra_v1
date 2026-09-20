import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { BettingError } from "@/server/errors";
import { isUniqueViolation } from "@/server/prisma-retry";

/**
 * Cash backing user orders.
 *
 * The rule this module exists to enforce: **a user's bet is funded by that user's
 * money.** Without it, orders execute against the omnibus wallet, which is Veyra's
 * capital, and every bet is a gift.
 *
 * ## How the money moves
 *
 * Placing an order debits the wallet's balance for the full cost and writes a
 * `FundsHold` as the receipt, inside the same transaction that creates the order.
 * Balance therefore always means *spendable*, which makes the non-negative CHECK on
 * `treasury_balances` a genuine backstop rather than an error that surfaces as a 500
 * during a race.
 *
 * When the order reaches a terminal state, whatever it did not spend is released
 * back. Release is asynchronous on purpose: it only ever returns money, so a delayed
 * or crashed release is conservative — the worst case is funds held slightly too
 * long, never spent twice. That also keeps cash out of `applyExecutionResult`, the
 * most safety-critical function in the codebase, which stays about fills alone.
 *
 * ## Paper never touches real cash
 *
 * Only executions with `mode === "live"` reserve funds. Paper fills are simulated,
 * so debiting a real balance against them would be the worst available combination:
 * real money at risk on imaginary trades. `settlesInCash` is the single gate.
 */

export const CASH_ASSET = "USDC";
export const CASH_DECIMALS = 6;

type Tx = Prisma.TransactionClient;
/** Env as a plain record: callers pass literals, which NodeJS.ProcessEnv rejects. */
type EnvRecord = Record<string, string | undefined>;

/**
 * Whether custody is switched on. Off by default: the system runs paper-first, and
 * turning this on is the deliberate act of starting to hold user money. Keeping it
 * a flag rather than inferring it from execution mode also means a live-venue test
 * is not silently a real-money test.
 */
export function custodyEnabled(env: NodeJS.ProcessEnv = process.env) {
  return (env.VEYRA_CUSTODY_ENABLED ?? "").trim().toLowerCase() === "true";
}

/** Whether an execution moves real money. Paper never does, nor does custody-off. */
export function settlesInCash(mode: string, env: NodeJS.ProcessEnv = process.env) {
  return custodyEnabled(env) && mode === "live";
}

/**
 * Worst-case venue fee for a given notional, in micros.
 *
 * Polymarket's taker fee is `shares x rate x p x (1 - p)`, so as a fraction of
 * notional (`shares x p`) it is `rate x (1 - p)` — maximised as p approaches 0 and
 * bounded above by the fee rate itself. Reserving the notional plus that rate
 * therefore covers any fill the venue can produce.
 *
 * This must be reserved up front. Reserving only the notional means a full fill
 * costs more than was held, the release caps the overage away, and the fee is
 * silently absorbed by the house instead of being charged to the trader.
 */
export function feeReserveMicros(notionalMicros: bigint, env: EnvRecord = process.env) {
  const bps = BigInt(Math.max(0, Number.parseInt(env.VEYRA_FEE_RESERVE_BPS ?? "200", 10) || 0));
  if (notionalMicros <= 0n || bps <= 0n) return 0n;
  // Round up: under-reserving reintroduces the leak.
  return (notionalMicros * bps + 9_999n) / 10_000n;
}

/** Notional plus the worst-case fee: what an order must reserve. */
export function orderReserveMicros(notionalMicros: bigint, env: EnvRecord = process.env) {
  return notionalMicros + feeReserveMicros(notionalMicros, env);
}

/** Spendable balance. Holds have already been debited, so this is simply the row. */
export async function availableMicros(
  client: PrismaClient | Tx,
  walletAddress: string,
): Promise<bigint> {
  const row = await client.treasuryBalance.findUnique({
    where: { walletAddress_asset: { walletAddress: walletAddress.toLowerCase(), asset: CASH_ASSET } },
  });
  return row?.balanceBase ?? 0n;
}

/** Total currently committed to open orders, for display alongside `available`. */
export async function heldMicros(
  client: PrismaClient | Tx,
  walletAddress: string,
): Promise<bigint> {
  const result = await client.fundsHold.aggregate({
    where: { walletAddress: walletAddress.toLowerCase(), status: "ACTIVE" },
    _sum: { amountMicros: true, spentMicros: true },
  });
  return (result._sum.amountMicros ?? 0n) - (result._sum.spentMicros ?? 0n);
}

/**
 * Reserves the cost of an order, inside the caller's transaction.
 *
 * Locks the balance row first: the check is read-then-write, which races exactly
 * like the voting budget did. Throws `INSUFFICIENT_FUNDS`, which rolls back the
 * whole transaction, so a user never ends up with an order they could not fund.
 */
export async function reserveFunds(
  tx: Tx,
  input: { walletAddress: string; executionId: string; amountMicros: bigint },
) {
  const walletAddress = input.walletAddress.toLowerCase();
  if (input.amountMicros <= 0n) return null;

  await tx.$queryRaw`SELECT "id" FROM "treasury_balances" WHERE "walletAddress" = ${walletAddress} AND "asset" = ${CASH_ASSET} FOR UPDATE`;

  const balance = await tx.treasuryBalance.findUnique({
    where: { walletAddress_asset: { walletAddress, asset: CASH_ASSET } },
  });
  const available = balance?.balanceBase ?? 0n;
  if (available < input.amountMicros) {
    throw new BettingError(
      "INSUFFICIENT_FUNDS",
      "Not enough deposited funds to cover this order.",
      402,
    );
  }

  const hold = await tx.fundsHold.create({
    data: {
      walletAddress,
      executionId: input.executionId,
      amountMicros: input.amountMicros,
      status: "ACTIVE",
    },
  });
  await tx.treasuryLedgerEntry.create({
    data: {
      walletAddress,
      asset: CASH_ASSET,
      deltaBase: -input.amountMicros,
      decimals: CASH_DECIMALS,
      kind: "HOLD",
      refType: "Execution",
      refId: input.executionId,
    },
  });
  await tx.treasuryBalance.update({
    where: { walletAddress_asset: { walletAddress, asset: CASH_ASSET } },
    data: { balanceBase: { decrement: input.amountMicros } },
  });
  return hold;
}

/**
 * Releases the unspent remainder of a terminal order.
 *
 * Idempotent twice over: the hold's status is claimed atomically, and the ledger
 * entry is unique per (Execution, HOLD_RELEASE). Safe to re-run after a crash.
 */
export async function releaseHold(
  prisma: PrismaClient,
  executionId: string,
  spentMicros: bigint,
) {
  const hold = await prisma.fundsHold.findUnique({ where: { executionId } });
  if (!hold || hold.status !== "ACTIVE") return { released: false, refundMicros: 0n };

  // Never "spend" more than was reserved: a venue filling beyond the reservation is
  // an incident for reconciliation to flag, not something to silently fund.
  const capped = spentMicros > hold.amountMicros;
  const spent = capped ? hold.amountMicros : spentMicros;
  const refund = hold.amountMicros - spent;
  if (capped) {
    // The venue charged more than was reserved, so the difference is absorbed by
    // the house. Never silent: this is a solvency event, not a rounding detail.
    console.error("[custody] execution cost exceeded its reservation", {
      executionId,
      reservedMicros: hold.amountMicros.toString(),
      actualMicros: spentMicros.toString(),
      shortfallMicros: (spentMicros - hold.amountMicros).toString(),
    });
  }

  const claim = await prisma.fundsHold.updateMany({
    where: { id: hold.id, status: "ACTIVE" },
    data: {
      status: spent > 0n ? "SETTLED" : "RELEASED",
      spentMicros: spent,
      settledAt: new Date(),
    },
  });
  if (claim.count !== 1) return { released: false, refundMicros: 0n };

  if (refund > 0n) {
    await creditCash(prisma, {
      walletAddress: hold.walletAddress,
      amountMicros: refund,
      kind: "HOLD_RELEASE",
      refType: "Execution",
      refId: executionId,
    });
  }
  return { released: true, refundMicros: refund, capped };
}

/**
 * Credits a wallet. Idempotent per (refType, refId, kind), so a retried worker
 * cannot pay twice.
 */
export async function creditCash(
  prisma: PrismaClient,
  input: {
    walletAddress: string;
    amountMicros: bigint;
    kind: "HOLD_RELEASE" | "SELL_CREDIT" | "PAYOUT" | "DEPOSIT" | "REVERSAL" | "ADJUSTMENT";
    refType: string;
    refId: string;
  },
) {
  if (input.amountMicros <= 0n) return { credited: false };
  const walletAddress = input.walletAddress.toLowerCase();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.treasuryLedgerEntry.create({
        data: {
          walletAddress,
          asset: CASH_ASSET,
          deltaBase: input.amountMicros,
          decimals: CASH_DECIMALS,
          kind: input.kind,
          refType: input.refType,
          refId: input.refId,
        },
      });
      await tx.treasuryBalance.upsert({
        where: { walletAddress_asset: { walletAddress, asset: CASH_ASSET } },
        create: {
          walletAddress,
          asset: CASH_ASSET,
          decimals: CASH_DECIMALS,
          balanceBase: input.amountMicros,
        },
        update: { balanceBase: { increment: input.amountMicros } },
      });
    });
    return { credited: true };
  } catch (error) {
    // Already credited for this cause.
    if (isUniqueViolation(error)) return { credited: false };
    throw error;
  }
}

/**
 * Debits a wallet for a cause other than an order (a fee at resolution). Fails
 * rather than going negative, which reconciliation then reports.
 */
export async function debitCash(
  prisma: PrismaClient,
  input: {
    walletAddress: string;
    amountMicros: bigint;
    kind: "FEE_DEBIT" | "WITHDRAWAL" | "ADJUSTMENT";
    refType: string;
    refId: string;
  },
) {
  if (input.amountMicros <= 0n) return { debited: false };
  const walletAddress = input.walletAddress.toLowerCase();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "treasury_balances" WHERE "walletAddress" = ${walletAddress} AND "asset" = ${CASH_ASSET} FOR UPDATE`;
      const balance = await tx.treasuryBalance.findUnique({
        where: { walletAddress_asset: { walletAddress, asset: CASH_ASSET } },
      });
      if ((balance?.balanceBase ?? 0n) < input.amountMicros) {
        throw new BettingError("INSUFFICIENT_FUNDS", "Balance does not cover this debit.", 402);
      }
      await tx.treasuryLedgerEntry.create({
        data: {
          walletAddress,
          asset: CASH_ASSET,
          deltaBase: -input.amountMicros,
          decimals: CASH_DECIMALS,
          kind: input.kind,
          refType: input.refType,
          refId: input.refId,
        },
      });
      await tx.treasuryBalance.update({
        where: { walletAddress_asset: { walletAddress, asset: CASH_ASSET } },
        data: { balanceBase: { decrement: input.amountMicros } },
      });
    });
    return { debited: true };
  } catch (error) {
    if (isUniqueViolation(error)) return { debited: false };
    throw error;
  }
}

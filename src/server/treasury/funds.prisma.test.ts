import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDatabase } from "@/server/testing/db";
import {
  availableMicros,
  feeReserveMicros,
  orderReserveMicros,
  CASH_ASSET,
  creditCash,
  custodyEnabled,
  debitCash,
  heldMicros,
  releaseHold,
  reserveFunds,
  settlesInCash,
} from "@/server/treasury/funds";

let prisma: PrismaClient;
let database: ReturnType<typeof createTestDatabase>;

const USD = 1_000_000n;
const WALLET = "0xcafe000000000000000000000000000000000001";

beforeAll(() => {
  database = createTestDatabase("funds");
  prisma = database.prisma;
}, 120_000);

afterAll(async () => {
  await database?.drop();
});

beforeEach(async () => {
  await prisma.fundsHold.deleteMany();
  await prisma.treasuryLedgerEntry.deleteMany();
  await prisma.treasuryBalance.deleteMany();
});

async function fund(amount: bigint) {
  await creditCash(prisma, {
    walletAddress: WALLET,
    amountMicros: amount,
    kind: "DEPOSIT",
    refType: "Test",
    refId: `seed-${amount}-${Math.random()}`,
  });
}

/** Reserve outside a caller transaction, as the repository does inside one. */
const reserve_ = (executionId: string, amountMicros: bigint) =>
  prisma.$transaction((tx) => reserveFunds(tx, { walletAddress: WALLET, executionId, amountMicros }));

const reserve = (executionId: string, amountMicros: bigint) =>
  prisma.$transaction((tx) => reserveFunds(tx, { walletAddress: WALLET, executionId, amountMicros }));

describe("Cash custody", () => {
  it("is off by default, so paper trading never touches a balance", () => {
    expect(custodyEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(settlesInCash("live", {} as NodeJS.ProcessEnv)).toBe(false);
    const on = { VEYRA_CUSTODY_ENABLED: "true" } as unknown as NodeJS.ProcessEnv;
    expect(settlesInCash("live", on)).toBe(true);
    // Even with custody on, a simulated order never moves real money.
    expect(settlesInCash("paper", on)).toBe(false);
  });

  it("debits on reserve, so the balance always means spendable", async () => {
    await fund(100n * USD);
    await reserve("exec-1", 30n * USD);

    expect(await availableMicros(prisma, WALLET)).toBe(70n * USD);
    expect(await heldMicros(prisma, WALLET)).toBe(30n * USD);
  });

  it("refuses an order the wallet cannot fund, and reserves nothing", async () => {
    await fund(10n * USD);
    await expect(reserve("exec-1", 25n * USD)).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    expect(await availableMicros(prisma, WALLET)).toBe(10n * USD);
    expect(await prisma.fundsHold.count()).toBe(0);
  });

  it("never lets concurrent orders spend the same balance twice", async () => {
    // The check is read-then-write, which races without the row lock: two orders
    // both see 100 available and both reserve 60.
    await fund(100n * USD);
    const attempts = await Promise.allSettled([
      reserve("exec-a", 60n * USD),
      reserve("exec-b", 60n * USD),
    ]);
    const ok = attempts.filter((a) => a.status === "fulfilled");
    expect(ok).toHaveLength(1);
    // The loser must be refused cleanly. Without the row lock the database CHECK
    // still stops the overdraft, but it surfaces as a constraint violation — a 500
    // to the user instead of "not enough funds".
    const rejected = attempts.find((a) => a.status === "rejected");
    expect(rejected).toBeDefined();
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    expect(await availableMicros(prisma, WALLET)).toBe(40n * USD);
    expect(await prisma.fundsHold.count()).toBe(1);
  });

  it("returns the unspent remainder of a partial fill", async () => {
    await fund(100n * USD);
    await reserve("exec-1", 40n * USD);

    // Only 15 of the 40 reserved actually filled.
    const result = await releaseHold(prisma, "exec-1", 15n * USD);
    expect(result).toEqual({ released: true, refundMicros: 25n * USD, capped: false });
    expect(await availableMicros(prisma, WALLET)).toBe(85n * USD);
    expect(await heldMicros(prisma, WALLET)).toBe(0n);
    expect((await prisma.fundsHold.findUniqueOrThrow({ where: { executionId: "exec-1" } })).status).toBe("SETTLED");
  });

  it("reserves the venue fee, so a fully filled order charges the trader for it", async () => {
    // The leak: reserving only the notional means a full fill costs more than was
    // held, releaseHold caps the overage away, and nobody is charged the fee — the
    // house absorbs it with no ledger entry at all.
    await fund(100n * USD);
    const notional = 40n * USD;
    const reserve = orderReserveMicros(notional, {});
    expect(reserve).toBeGreaterThan(notional);

    await reserve_("exec-fee", reserve);
    // Venue fills the whole order and charges a fee on top.
    const fee = 300_000n;
    const result = await releaseHold(prisma, "exec-fee", notional + fee);

    expect(result.capped).toBe(false);
    // The trader paid notional + fee; only the unused buffer came back.
    expect(result.refundMicros).toBe(reserve - notional - fee);
    expect(await availableMicros(prisma, WALLET)).toBe(100n * USD - notional - fee);
    expect(
      (await prisma.fundsHold.findUniqueOrThrow({ where: { executionId: "exec-fee" } })).spentMicros,
    ).toBe(notional + fee);
  });

  it("bounds the fee reserve by the configured rate and rounds it up", () => {
    // Polymarket's taker fee is shares x rate x p x (1 - p), which as a fraction of
    // notional is bounded above by the rate itself.
    expect(feeReserveMicros(10_000_000n, { VEYRA_FEE_RESERVE_BPS: "200" })).toBe(200_000n);
    expect(feeReserveMicros(1n, { VEYRA_FEE_RESERVE_BPS: "200" })).toBe(1n);
    expect(feeReserveMicros(10_000_000n, { VEYRA_FEE_RESERVE_BPS: "0" })).toBe(0n);
    expect(feeReserveMicros(0n, {})).toBe(0n);
  });

  it("flags rather than hides an execution that cost more than it reserved", async () => {
    await fund(100n * USD);
    await reserve_("exec-over", 20n * USD);
    const result = await releaseHold(prisma, "exec-over", 50n * USD);
    expect(result.capped).toBe(true);
    expect(result.refundMicros).toBe(0n);
  });

  it("returns everything when an order fills nothing", async () => {
    await fund(50n * USD);
    await reserve("exec-1", 20n * USD);
    await releaseHold(prisma, "exec-1", 0n);
    expect(await availableMicros(prisma, WALLET)).toBe(50n * USD);
    expect((await prisma.fundsHold.findUniqueOrThrow({ where: { executionId: "exec-1" } })).status).toBe("RELEASED");
  });

  it("releases once, however many workers try", async () => {
    await fund(100n * USD);
    await reserve("exec-1", 40n * USD);

    const runs = await Promise.all([
      releaseHold(prisma, "exec-1", 10n * USD),
      releaseHold(prisma, "exec-1", 10n * USD),
      releaseHold(prisma, "exec-1", 10n * USD),
    ]);
    expect(runs.filter((r) => r.released)).toHaveLength(1);
    expect(await availableMicros(prisma, WALLET)).toBe(90n * USD);
    expect(await releaseHold(prisma, "exec-1", 10n * USD)).toEqual({ released: false, refundMicros: 0n });
  });

  it("never funds a venue that filled more than was reserved", async () => {
    // An overfill is an incident for reconciliation, not something to silently pay.
    await fund(100n * USD);
    await reserve("exec-1", 20n * USD);
    const result = await releaseHold(prisma, "exec-1", 50n * USD);
    expect(result.refundMicros).toBe(0n);
    expect(await availableMicros(prisma, WALLET)).toBe(80n * USD);
  });

  it("credits and debits once per cause", async () => {
    await fund(100n * USD);
    const payout = { walletAddress: WALLET, amountMicros: 10n * USD, refType: "Position", refId: "p1" } as const;
    expect(await creditCash(prisma, { ...payout, kind: "PAYOUT" })).toEqual({ credited: true });
    expect(await creditCash(prisma, { ...payout, kind: "PAYOUT" })).toEqual({ credited: false });
    expect(await availableMicros(prisma, WALLET)).toBe(110n * USD);

    const fee = { walletAddress: WALLET, amountMicros: 2n * USD, refType: "Position", refId: "p1" } as const;
    expect(await debitCash(prisma, { ...fee, kind: "FEE_DEBIT" })).toEqual({ debited: true });
    expect(await debitCash(prisma, { ...fee, kind: "FEE_DEBIT" })).toEqual({ debited: false });
    expect(await availableMicros(prisma, WALLET)).toBe(108n * USD);
  });

  it("refuses a debit the balance cannot cover rather than going negative", async () => {
    await fund(5n * USD);
    await expect(
      debitCash(prisma, {
        walletAddress: WALLET,
        amountMicros: 9n * USD,
        kind: "FEE_DEBIT",
        refType: "Position",
        refId: "p9",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    expect(await availableMicros(prisma, WALLET)).toBe(5n * USD);
  });

  it("refuses a negative balance at the database, not just in application code", async () => {
    // debitCash and reserveFunds both guard against overdrafts, so the CHECK is a
    // backstop for any path that bypasses them — a migration, an operator script,
    // a future writer. Without this the constraint could be dropped and every test
    // would still pass.
    await fund(5n * USD);
    await expect(
      prisma.treasuryBalance.update({
        where: { walletAddress_asset: { walletAddress: WALLET, asset: CASH_ASSET } },
        data: { balanceBase: { decrement: 6n * USD } },
      }),
    ).rejects.toThrow();

    // The failed write left the balance untouched.
    expect(await availableMicros(prisma, WALLET)).toBe(5n * USD);
  });

  it("refuses a hold that claims more than it reserves", async () => {
    // funds_holds_amounts_check: spent can never exceed the reservation, so a bad
    // writer cannot make a hold look like it spent money that was never held.
    await fund(50n * USD);
    await reserve_("exec-check", 10n * USD);
    await expect(
      prisma.fundsHold.update({
        where: { executionId: "exec-check" },
        data: { spentMicros: 11n * USD },
      }),
    ).rejects.toThrow();
  });

  it("keeps the ledger and the balance in agreement", async () => {
    await fund(100n * USD);
    await reserve("exec-1", 40n * USD);
    await releaseHold(prisma, "exec-1", 25n * USD);
    await creditCash(prisma, {
      walletAddress: WALLET,
      amountMicros: 50n * USD,
      kind: "PAYOUT",
      refType: "Position",
      refId: "p1",
    });

    const entries = await prisma.treasuryLedgerEntry.aggregate({
      where: { walletAddress: WALLET, asset: CASH_ASSET },
      _sum: { deltaBase: true },
    });
    expect(entries._sum.deltaBase).toBe(await availableMicros(prisma, WALLET));
    // 100 - 40 + 15 + 50
    expect(await availableMicros(prisma, WALLET)).toBe(125n * USD);
  });
});

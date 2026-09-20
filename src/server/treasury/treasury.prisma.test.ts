import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDatabase } from "@/server/testing/db";
import { loadSupportedAssets, walletsAreSeparate } from "@/server/treasury/config";
import { accountingSeparationReport, exposureFor } from "@/server/treasury/exposure";
import { auditBalances, balancesFor, creditDeposit, reverseDeposit } from "@/server/treasury/ledger";
import { reconcileSolvency } from "@/server/treasury/solvency";
import { confirmationDepth, maxScanSpan, resumeFromBlock } from "@/server/treasury/watcher";
import { CASH_ASSET, creditCash } from "@/server/treasury/funds";
import { applyConfirmedDeposits } from "@/server/treasury/watcher";
import { completeWithdrawal, failWithdrawal, requestWithdrawal } from "@/server/treasury/withdrawals";

let prisma: PrismaClient;
let database: ReturnType<typeof createTestDatabase>;

const TREASURY = "0x1111111111111111111111111111111111111111";
const EXECUTION = "0x2222222222222222222222222222222222222222";
const USER = "0xaaaa000000000000000000000000000000000001";

/** NVDA and AMD as tokenized assets on Polygon, 18 decimals. */
const ENV = {
  VEYRA_TREASURY_ADDRESS: TREASURY,
  POLYMARKET_FUNDER_ADDRESS: EXECUTION,
  VEYRA_TREASURY_ASSETS: `NVDA:0x3333333333333333333333333333333333333333:137:18,AMD:0x4444444444444444444444444444444444444444:137:18`,
} as unknown as NodeJS.ProcessEnv;

const txHash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

beforeAll(() => {
  database = createTestDatabase("treasury");
  prisma = database.prisma;
}, 120_000);

afterAll(async () => {
  await database?.drop();
});

beforeEach(async () => {
  await prisma.treasuryLedgerEntry.deleteMany();
  await prisma.treasuryBalance.deleteMany();
  await prisma.treasuryDeposit.deleteMany();
  await prisma.treasuryWithdrawal.deleteMany();
});

describe("Treasury custody ledger (Prisma)", () => {
  it("credits a deposit once and keeps the ledger and balance in step", async () => {
    const result = await creditDeposit(
      prisma,
      { walletAddress: USER, asset: "NVDA", chainId: 137, txHash: txHash(1), logIndex: 0, amountBase: 5_000_000_000_000_000_000n },
      ENV,
    );
    expect(result.credited).toBe(true);
    expect(result.balanceBase).toBe(5_000_000_000_000_000_000n);

    expect(await balancesFor(prisma, USER)).toEqual([
      { asset: "NVDA", balanceBase: "5000000000000000000", decimals: 18 },
    ]);
    expect(await auditBalances(prisma)).toMatchObject({ checked: 1, discrepancies: [] });
  });

  it("is idempotent for the same transfer, however many times it is observed", async () => {
    const deposit = {
      walletAddress: USER,
      asset: "NVDA",
      chainId: 137,
      txHash: txHash(2),
      logIndex: 1,
      amountBase: 2_000_000_000_000_000_000n,
    };
    const results = await Promise.all(Array.from({ length: 6 }, () => creditDeposit(prisma, deposit, ENV)));

    expect(results.filter((r) => r.credited)).toHaveLength(1);
    expect(new Set(results.map((r) => r.depositId)).size).toBe(1);
    expect(await prisma.treasuryDeposit.count()).toBe(1);
    expect(await prisma.treasuryLedgerEntry.count()).toBe(1);
    const balance = await prisma.treasuryBalance.findFirstOrThrow();
    expect(balance.balanceBase).toBe(2_000_000_000_000_000_000n);
    expect(await auditBalances(prisma)).toMatchObject({ discrepancies: [] });
  });

  it("separates deposits by log index within one transaction", async () => {
    const base = { walletAddress: USER, asset: "AMD", chainId: 137, txHash: txHash(3), amountBase: 1_000n };
    await creditDeposit(prisma, { ...base, logIndex: 0 }, ENV);
    await creditDeposit(prisma, { ...base, logIndex: 1 }, ENV);
    const balance = await prisma.treasuryBalance.findFirstOrThrow({ where: { asset: "AMD" } });
    expect(balance.balanceBase).toBe(2_000n);
  });

  it("refuses unsupported assets, wrong chains and malformed transfers", async () => {
    const base = { walletAddress: USER, chainId: 137, txHash: txHash(4), logIndex: 0, amountBase: 1_000n };
    await expect(creditDeposit(prisma, { ...base, asset: "TSLA" }, ENV)).rejects.toMatchObject({
      code: "UNSUPPORTED_ASSET",
    });
    await expect(creditDeposit(prisma, { ...base, asset: "NVDA", chainId: 1 }, ENV)).rejects.toMatchObject({
      code: "UNSUPPORTED_ASSET",
    });
    await expect(creditDeposit(prisma, { ...base, asset: "NVDA", amountBase: 0n }, ENV)).rejects.toMatchObject({
      code: "INVALID_DEPOSIT",
    });
    await expect(creditDeposit(prisma, { ...base, asset: "NVDA", txHash: "0xdead" }, ENV)).rejects.toMatchObject({
      code: "INVALID_DEPOSIT",
    });
    expect(await prisma.treasuryDeposit.count()).toBe(0);
  });

  it("refuses to credit anything when the two wallets are not separate", async () => {
    const shared = {
      ...ENV,
      POLYMARKET_FUNDER_ADDRESS: TREASURY,
    } as unknown as NodeJS.ProcessEnv;
    expect(walletsAreSeparate(shared)).toBe(false);
    await expect(
      creditDeposit(
        prisma,
        { walletAddress: USER, asset: "NVDA", chainId: 137, txHash: txHash(5), logIndex: 0, amountBase: 1n },
        shared,
      ),
    ).rejects.toMatchObject({ code: "TREASURY_CONFIG" });
    expect(await prisma.treasuryDeposit.count()).toBe(0);
  });

  it("refuses deposits when no treasury wallet is configured", async () => {
    const disabled = { VEYRA_TREASURY_ASSETS: ENV.VEYRA_TREASURY_ASSETS } as unknown as NodeJS.ProcessEnv;
    await expect(
      creditDeposit(
        prisma,
        { walletAddress: USER, asset: "NVDA", chainId: 137, txHash: txHash(6), logIndex: 0, amountBase: 1n },
        disabled,
      ),
    ).rejects.toMatchObject({ code: "TREASURY_DISABLED" });
  });

  it("parses the supported-asset list and rejects malformed entries", () => {
    expect(loadSupportedAssets(ENV)).toEqual([
      { symbol: "NVDA", contract: "0x3333333333333333333333333333333333333333", chainId: 137, decimals: 18 },
      { symbol: "AMD", contract: "0x4444444444444444444444444444444444444444", chainId: 137, decimals: 18 },
    ]);
    expect(loadSupportedAssets({} as NodeJS.ProcessEnv)).toEqual([]);
    expect(() =>
      loadSupportedAssets({ VEYRA_TREASURY_ASSETS: "NVDA:not-an-address:137:18" } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/Malformed/);
  });

  it("reports treasury and execution as separate ledgers, addresses only", async () => {
    await creditDeposit(
      prisma,
      { walletAddress: USER, asset: "NVDA", chainId: 137, txHash: txHash(7), logIndex: 0, amountBase: 7n },
      ENV,
    );
    const report = await accountingSeparationReport(prisma, ENV);

    expect(report.wallets).toMatchObject({
      treasury: { address: TREASURY.toLowerCase(), usedForExecution: false },
      execution: { address: EXECUTION.toLowerCase(), holdsUserDeposits: false },
      separate: true,
    });
    expect(report.treasuryLedger).toEqual([{ asset: "NVDA", holders: 1, totalBase: "7" }]);
    // Deposits are never counted as venue exposure.
    expect(report.executionLedger).toMatchObject({ openPositions: 0, totalNotionalMicros: "0" });
    // No secret ever appears in the report.
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE|0x[0-9a-f]{64}/i);
  });

  it("derives venue exposure from filled positions only", async () => {
    await prisma.market.upsert({
      where: { id: "expo-market" },
      create: { id: "expo-market", title: "t", category: "crypto", tag: "t", status: "open", source: "polymarket" },
      update: {},
    });
    const makePrediction = async (shares: bigint, notional: bigint, status: string) => {
      const prediction = await prisma.prediction.create({
        data: {
          walletAddress: USER,
          marketId: "expo-market",
          outcome: "YES",
          confidenceBps: 7000,
          stakeMicros: 10_000_000n,
          marketPriceBps: 5000,
          engineVersion: "v1",
          engineInputJson: "{}",
          engineOutputJson: "{}",
          status: "accepted",
          position: {
            create: {
              marketId: "expo-market",
              walletAddress: USER,
              outcome: "YES",
              side: "BUY",
              tokenId: "tok",
              sharesMicros: shares,
              limitPriceBps: 5200,
              avgPriceBps: 5000,
              notionalMicros: notional,
              payoutMicros: 0n,
              edgeBps: 100,
              kellyBps: 2500,
              status,
            },
          },
        },
      });
      return prediction;
    };
    await makePrediction(40_000_000n, 20_000_000n, "filled");
    await makePrediction(0n, 0n, "pending"); // never filled: no exposure

    const exposure = await exposureFor(prisma, USER);
    expect(exposure.positions).toHaveLength(1);
    expect(exposure.totalNotionalMicros).toBe("20000000");

    // Treasury balances are not netted against venue exposure.
    const report = await accountingSeparationReport(prisma, ENV);
    expect(report.executionLedger.openPositions).toBe(1);
  });

  it("debits a withdrawal immediately and reverses it if the operator fails the send", async () => {
    await prisma.treasuryWithdrawal.deleteMany();
    await creditCash(prisma, {
      walletAddress: USER,
      amountMicros: 50_000_000n,
      kind: "DEPOSIT",
      refType: "Test",
      refId: "wd-seed",
    });
    const row = await requestWithdrawal(prisma, {
      walletAddress: USER,
      destAddress: "0x5555555555555555555555555555555555555555",
      amountMicros: 10_000_000n,
    });
    const usdc = await prisma.treasuryBalance.findUniqueOrThrow({
      where: { walletAddress_asset: { walletAddress: USER, asset: CASH_ASSET } },
    });
    expect(usdc.balanceBase).toBe(40_000_000n);
    await failWithdrawal(prisma, { id: row.id });
    const after = await prisma.treasuryBalance.findUniqueOrThrow({
      where: { walletAddress_asset: { walletAddress: USER, asset: CASH_ASSET } },
    });
    expect(after.balanceBase).toBe(50_000_000n);
    expect((await prisma.treasuryWithdrawal.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("FAILED");
  });

  it("still reverses a reorged deposit the user has already spent", async () => {
    // The case the reversal path exists for. Previously this threw, flipped the
    // deposit back to CREDITED and aborted the sweep — leaving phantom funds
    // spendable and the reorg unrecorded.
    await prisma.treasuryDeposit.deleteMany();
    await prisma.treasuryLedgerEntry.deleteMany();
    await prisma.treasuryBalance.deleteMany();

    const credited = await creditDeposit(
      prisma,
      { walletAddress: USER, asset: "NVDA", chainId: 137, txHash: txHash(91), logIndex: 0, amountBase: 10_000_000n },
      ENV,
    );
    expect(credited.credited).toBe(true);

    // User spends most of it before the reorg is noticed.
    await prisma.treasuryBalance.update({
      where: { walletAddress_asset: { walletAddress: USER, asset: "NVDA" } },
      data: { balanceBase: 3_000_000n },
    });

    const result = await reverseDeposit(prisma, credited.depositId);
    expect(result.reversed).toBe(true);
    // Clawed back what was there; the rest is recorded as a shortfall.
    expect(result.unrecoveredMicros).toBe(7_000_000n);

    const balance = await prisma.treasuryBalance.findUniqueOrThrow({
      where: { walletAddress_asset: { walletAddress: USER, asset: "NVDA" } },
    });
    expect(balance.balanceBase).toBe(0n);

    const row = await prisma.treasuryDeposit.findUniqueOrThrow({ where: { id: credited.depositId } });
    expect(row.status).toBe("REVERSED");
    expect(row.unrecoveredMicros).toBe(7_000_000n);

    // Replaying is a no-op, not a second clawback.
    expect(await reverseDeposit(prisma, credited.depositId)).toEqual({
      reversed: false,
      unrecoveredMicros: 0n,
    });
  });

  it("resumes scanning from the stored cursor instead of a fixed window", async () => {
    // Without a cursor the watcher only ever looks a fixed span back from the head,
    // so an outage longer than that window loses deposits with no trace.
    await prisma.depositScanCursor.deleteMany();
    const span = 2_000n;

    // First run: nothing stored, so look one span back from the confirmed head.
    expect(await resumeFromBlock(prisma, 137, 50_000n, span)).toBe(48_000n);
    // A chain younger than the span starts at genesis.
    expect(await resumeFromBlock(prisma, 137, 500n, span)).toBe(0n);

    // With a cursor, resume at the next unscanned block — however far behind.
    await prisma.depositScanCursor.create({ data: { chainId: 137, lastScannedBlock: 10_000n } });
    expect(await resumeFromBlock(prisma, 137, 50_000n, span)).toBe(10_001n);

    // Never scan past the confirmed head.
    await prisma.depositScanCursor.update({
      where: { chainId: 137 },
      data: { lastScannedBlock: 60_000n },
    });
    expect(await resumeFromBlock(prisma, 137, 50_000n, span)).toBe(50_000n);

    // Cursors are per chain.
    expect(await resumeFromBlock(prisma, 80_002, 50_000n, span)).toBe(48_000n);
  });

  it("clamps the scan span and confirmation depth to sane values", () => {
    expect(maxScanSpan({ VEYRA_DEPOSIT_MAX_SPAN_BLOCKS: "500" })).toBe(500);
    expect(maxScanSpan({ VEYRA_DEPOSIT_MAX_SPAN_BLOCKS: "0" })).toBe(2_000);
    expect(maxScanSpan({ VEYRA_DEPOSIT_MAX_SPAN_BLOCKS: "nonsense" })).toBe(2_000);
    expect(maxScanSpan({} as NodeJS.ProcessEnv)).toBe(2_000);
    expect(confirmationDepth({ VEYRA_DEPOSIT_CONFIRMATIONS: "1" })).toBe(1);
    expect(confirmationDepth({ VEYRA_DEPOSIT_CONFIRMATIONS: "0" })).toBe(12);
    expect(confirmationDepth({ VEYRA_DEPOSIT_CONFIRMATIONS: "9999" })).toBe(12);
    expect(confirmationDepth({} as NodeJS.ProcessEnv)).toBe(12);
  });

  it("reports unrecovered reorg money as a solvency error", async () => {
    await prisma.treasuryDeposit.deleteMany();
    const clean = await reconcileSolvency(prisma, { VEYRA_CONTROLLED_USDC_MICROS: "1000000000" });
    expect(clean.findings.some((f) => f.code === "UNRECOVERED_DEPOSITS")).toBe(false);

    await prisma.treasuryDeposit.create({
      data: {
        walletAddress: USER,
        asset: "NVDA",
        chainId: 137,
        txHash: txHash(92),
        logIndex: 0,
        amountBase: 8_000_000n,
        decimals: 18,
        status: "REVERSED",
        unrecoveredMicros: 5_000_000n,
      },
    });
    const dirty = await reconcileSolvency(prisma, { VEYRA_CONTROLLED_USDC_MICROS: "1000000000" });
    expect(dirty.findings.some((f) => f.code === "UNRECOVERED_DEPOSITS" && f.severity === "error")).toBe(true);
    expect(dirty.ready).toBe(false);
    expect(dirty.unrecoveredDepositMicros).toBe("5000000");
  });

  it("never refunds a withdrawal the operator has already paid out", async () => {
    // Covers the sequential case: a withdrawal the operator already paid out must
    // never be refunded on top.
    //
    // The concurrent interleaving — failWithdrawal reads PENDING, completeWithdrawal
    // takes the row, then the refund lands anyway — is NOT reachable from a
    // sequential test. failWithdrawal claims the row before crediting so that window
    // does not exist; this test does not by itself prove that ordering.
    await prisma.treasuryWithdrawal.deleteMany();
    await creditCash(prisma, {
      walletAddress: USER,
      amountMicros: 50_000_000n,
      kind: "DEPOSIT",
      refType: "Test",
      refId: "wd-race-seed",
    });
    const row = await requestWithdrawal(prisma, {
      walletAddress: USER,
      destAddress: "0x5555555555555555555555555555555555555555",
      amountMicros: 10_000_000n,
    });

    // Operator sends the funds and marks it complete.
    await completeWithdrawal(prisma, { id: row.id, txHash: `0x${"ab".repeat(32)}` });
    // A second operator (or a retry) then tries to fail the same withdrawal.
    await expect(failWithdrawal(prisma, { id: row.id })).rejects.toMatchObject({
      code: "WITHDRAWAL_NOT_PENDING",
    });

    // The balance must still reflect the payout, not a refund on top of it.
    const after = await prisma.treasuryBalance.findUniqueOrThrow({
      where: { walletAddress_asset: { walletAddress: USER, asset: CASH_ASSET } },
    });
    expect(after.balanceBase).toBe(40_000_000n);
    expect(
      await prisma.treasuryLedgerEntry.count({
        where: { refType: "TreasuryWithdrawal", refId: row.id, kind: "REVERSAL" },
      }),
    ).toBe(0);
  });

  it("credits a watched deposit once and can reverse a reorg", async () => {
    const transfer = {
      walletAddress: USER,
      asset: "NVDA",
      chainId: 137,
      txHash: txHash(9),
      logIndex: 0,
      amountBase: 3_000n,
    };
    expect((await applyConfirmedDeposits(prisma, [transfer, transfer], ENV)).credited).toBe(1);
    const deposit = await prisma.treasuryDeposit.findFirstOrThrow({ where: { txHash: transfer.txHash } });
    expect(await reverseDeposit(prisma, deposit.id)).toEqual({ reversed: true, unrecoveredMicros: 0n });
    expect(await reverseDeposit(prisma, deposit.id)).toEqual({ reversed: false, unrecoveredMicros: 0n });
    expect((await prisma.treasuryDeposit.findUniqueOrThrow({ where: { id: deposit.id } })).status).toBe("REVERSED");
  });
});

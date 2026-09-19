import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDatabase } from "@/server/testing/db";
import { loadSupportedAssets, walletsAreSeparate } from "@/server/treasury/config";
import { accountingSeparationReport, exposureFor } from "@/server/treasury/exposure";
import { auditBalances, balancesFor, creditDeposit } from "@/server/treasury/ledger";

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
});

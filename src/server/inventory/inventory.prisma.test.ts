import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDatabase } from "@/server/testing/db";
import type { OrderBookSnapshot } from "@/lib/betting";
import { coreMarkets, type Market } from "@/lib/markets";
import { changeConfidence, createPrismaDeps, placePrediction, type BettingDeps } from "@/server/betting/service";
import { reconcileInventory, venueReference, type VenueTrade } from "@/server/inventory/reconcile";
import { latestReconciliationReport, loadLedgerSnapshot, runInventoryReconciliation, type InventoryVenue } from "@/server/inventory/service";
import { createPolymarketClient, type VenueOrderRequest, type VenueOrderResult } from "@/server/polymarket/client";
import { tradesForAccount } from "@/server/polymarket/live";

/**
 * Omnibus reconciliation against a scripted Polymarket account. The fake venue keeps
 * its own trade log and token balances, written when it executes orders, independent
 * of Veyra's database. Scenarios then corrupt one side and assert what is flagged.
 */

let prisma: PrismaClient;
let database: ReturnType<typeof createTestDatabase>;

beforeAll(() => {
  database = createTestDatabase("inv");
  prisma = database.prisma;
}, 120_000);

afterAll(async () => {
  await database?.drop();
});

beforeEach(async () => {
  await prisma.inventoryFinding.deleteMany();
  await prisma.inventoryReconciliationRun.deleteMany();
  await prisma.jobLease.deleteMany();
  await prisma.fill.deleteMany();
  await prisma.confidenceHistory.deleteMany();
  await prisma.executionSlice.deleteMany();
  await prisma.executionIntent.deleteMany();
  await prisma.executionBatch.deleteMany();
  await prisma.execution.deleteMany();
  await prisma.position.deleteMany();
  await prisma.reputationOpen.deleteMany();
  await prisma.prediction.deleteMany();
});

const CONFIG = { shareToleranceMicros: 10_000n, usdcToleranceMicros: 10_000n, usdcBaseline: null };

function book(tokenId: string): OrderBookSnapshot {
  return { tokenId, asks: [{ price: "0.50", size: "100000" }], bids: [{ price: "0.49", size: "100000" }], minOrderSize: "1", tickSize: "0.01", negRisk: false, source: "polymarket", timestamp: String(Date.now()), hash: "b" };
}

let tradeSeq = 0;
let marketSeq = 0;
let keySeq = 0;

function world() {
  marketSeq += 1;
  const marketId = `inv-${marketSeq}`;
  const market: Market = { ...coreMarkets[0]!, id: marketId, source: "polymarket", status: "open", openSeats: 1, clobTokenIds: [`${marketId}-yes`, `${marketId}-no`] };
  /** The venue's own books: executed trades, token balances and pUSD. */
  const account = { trades: [] as VenueTrade[], balances: new Map<string, bigint>(), collateral: 1_000_000_000n, fraction: 1, failNextList: false, delayMs: 0 };
  const deps = (): BettingDeps =>
    createPrismaDeps(prisma, {
      client: createPolymarketClient({
        mode: "live",
        getBook: async (tokenId) => book(tokenId),
        submitOrder: async (request: VenueOrderRequest): Promise<VenueOrderResult> => {
          tradeSeq += 1;
          const tradeId = `trade-${tradeSeq}`;
          const shares = (request.sharesMicros * BigInt(Math.round(account.fraction * 100))) / 100n;
          const price = request.side === "BUY" ? 5000 : 4900;
          account.trades.push({ tradeId, orderId: `order-${tradeSeq}`, tokenId: request.tokenId, side: request.side, sharesMicros: shares, priceBps: price, status: "CONFIRMED", matchedAt: new Date() });
          const signed = request.side === "BUY" ? shares : -shares;
          account.balances.set(request.tokenId, (account.balances.get(request.tokenId) ?? 0n) + signed);
          account.collateral += request.side === "BUY" ? -(shares * BigInt(price)) / 10_000n : (shares * BigInt(price)) / 10_000n;
          return {
            mode: "live",
            status: account.fraction >= 1 ? "filled" : "partial",
            polymarketOrderId: `order-${tradeSeq}`,
            response: {},
            fills: [{ priceBps: price, sharesMicros: shares, notionalMicros: (shares * BigInt(price)) / 10_000n, feeMicros: 0n, venueTradeId: tradeId, simulated: false }],
            errorMessage: null,
          };
        },
      }),
      getCatalogMarket: () => null,
      getLiveMarket: async (id) => (id === marketId ? market : null),
    });
  const venue: InventoryVenue & { calls: string[] } = {
    network: "polygon",
    calls: [],
    async getTokenBalance(tokenId) {
      venue.calls.push(`balance:${tokenId}`);
      return account.balances.get(tokenId) ?? 0n;
    },
    async getCollateralBalance() {
      return account.collateral;
    },
    async listTrades() {
      if (account.delayMs) await new Promise((resolve) => setTimeout(resolve, account.delayMs));
      if (account.failNextList) {
        account.failNextList = false;
        throw new Error("Polymarket 503");
      }
      return account.trades.map((trade) => ({ ...trade }));
    },
  };
  const wallet = (n: number) => `0x${marketSeq.toString(16).padStart(8, "0")}${n.toString(16).padStart(32, "0")}`;
  const bet = (walletAddress: string, outcome: "YES" | "NO", confidencePct = 80) =>
    placePrediction({ marketId, outcome, confidencePct, stakeUsd: "100.00", walletAddress, idempotencyKey: `inv-key-${(keySeq += 1).toString().padStart(6, "0")}` }, deps());
  const reconcile = async () => reconcileInventory(await loadLedgerSnapshot(prisma), { tokenBalances: new Map([...account.balances]), collateralMicros: account.collateral, trades: account.trades, tradesSince: null }, CONFIG);
  return { marketId, market, account, venue, deps, wallet, bet, reconcile };
}

const kinds = (findings: { kind: string; severity: string }[], severity = "error") => findings.filter((f) => f.severity === severity).map((f) => f.kind).sort();

async function ledgerFingerprint() {
  const positions = await prisma.position.findMany({ orderBy: { id: "asc" }, select: { id: true, sharesMicros: true, notionalMicros: true, status: true } });
  const fills = await prisma.fill.findMany({ orderBy: { id: "asc" }, select: { id: true, sharesMicros: true } });
  return JSON.stringify({ positions, fills }, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

describe("omnibus inventory reconciliation (Prisma)", () => {
  it("a consistent ledger and venue produce no errors (opposing YES/NO positions on separate tokens)", async () => {
    const w = world();
    await w.bet(w.wallet(1), "YES");
    await w.bet(w.wallet(2), "NO");
    await w.bet(w.wallet(1), "NO", 70); // same wallet holds both sides
    const result = await w.reconcile();
    expect(kinds(result.findings)).toEqual([]);
    expect(result.summary).toMatchObject({ ok: true, tokens: 2, venueTrades: 3 });
    expect(kinds(result.findings, "info")).toEqual(["usdc_unverifiable"]);
  });

  it("flags a venue trade missing from the ledger and the resulting unexpected shares", async () => {
    const w = world();
    await w.bet(w.wallet(1), "YES");
    w.account.trades.push({ tradeId: "ghost", orderId: "ghost-order", tokenId: w.market.clobTokenIds![0]!, side: "BUY", sharesMicros: 5_000_000n, priceBps: 5000, status: "CONFIRMED", matchedAt: new Date() });
    w.account.balances.set(w.market.clobTokenIds![0]!, w.account.balances.get(w.market.clobTokenIds![0]!)! + 5_000_000n);
    const result = await w.reconcile();
    expect(kinds(result.findings)).toEqual(["unexpected_shares", "venue_trade_not_in_ledger"]);
    expect(result.findings.find((f) => f.kind === "unexpected_shares")).toMatchObject({ tokenId: w.market.clobTokenIds![0] });
  });

  it("flags a recorded fill the venue never executed and the resulting missing shares", async () => {
    const w = world();
    await w.bet(w.wallet(1), "YES");
    const lost = w.account.trades.pop()!;
    w.account.balances.set(lost.tokenId, w.account.balances.get(lost.tokenId)! - lost.sharesMicros);
    const result = await w.reconcile();
    expect(kinds(result.findings)).toEqual(["ledger_fill_not_at_venue", "missing_shares"]);
  });

  it("flags a duplicated fill as excess recorded shares and an inconsistent position", async () => {
    const w = world();
    const opened = await w.bet(w.wallet(1), "YES");
    const original = await prisma.fill.findFirstOrThrow({ where: { execution: { position: { predictionId: opened.id } } } });
    // A second execution row recording the same venue trade again (a double-apply bug).
    const duplicate = await prisma.execution.create({
      data: { positionId: opened.position!.id, venue: "polymarket", mode: "live", status: "filled", tokenId: w.market.clobTokenIds![0]!, side: "BUY", orderType: "FAK", limitPriceBps: 5000, sizeSharesMicros: original.sharesMicros, notionalMicros: original.notionalMicros, requestJson: "{}" },
    });
    await prisma.fill.create({ data: { executionId: duplicate.id, venueTradeId: original.venueTradeId, priceBps: original.priceBps, sharesMicros: original.sharesMicros, notionalMicros: original.notionalMicros } });
    const result = await w.reconcile();
    expect(kinds(result.findings)).toEqual(["cost_basis_mismatch", "excess_recorded_fill", "position_shares_mismatch"]);
  });

  it("partial fills reconcile exactly; an under-recorded partial is flagged", async () => {
    const w = world();
    w.account.fraction = 0.4;
    const opened = await w.bet(w.wallet(1), "YES");
    expect(opened.position?.status).toBe("partial");
    expect(kinds((await w.reconcile()).findings)).toEqual([]);

    // Venue actually matched more than we recorded: the ledger is short and the
    // omnibus wallet holds shares no position accounts for.
    w.account.trades[0]!.sharesMicros += 2_000_000n;
    w.account.balances.set(w.market.clobTokenIds![0]!, w.account.balances.get(w.market.clobTokenIds![0]!)! + 2_000_000n);
    expect(kinds((await w.reconcile()).findings)).toEqual(["short_recorded_fill", "unexpected_shares"]);
  });

  it("a flattened position (buy then sell) reconciles to zero shares", async () => {
    const w = world();
    const wallet = w.wallet(1);
    const opened = await w.bet(wallet, "YES", 80);
    await changeConfidence(opened.id, { confidencePct: 40, walletAddress: wallet, idempotencyKey: `inv-key-${(keySeq += 1).toString().padStart(6, "0")}` }, w.deps());
    const position = await prisma.position.findFirstOrThrow({ where: { predictionId: opened.id } });
    expect(position).toMatchObject({ sharesMicros: 0n, status: "closed" });
    expect(w.account.balances.get(w.market.clobTokenIds![0]!)).toBe(0n);
    const result = await w.reconcile();
    expect(kinds(result.findings)).toEqual([]);
    expect(result.summary.venueTrades).toBe(2);
  });

  it("detects a corrupted cost basis from the position's own fills", async () => {
    const w = world();
    const opened = await w.bet(w.wallet(1), "YES");
    await prisma.position.update({ where: { predictionId: opened.id }, data: { notionalMicros: { increment: 1_000_000n } } });
    expect(kinds((await w.reconcile()).findings)).toEqual(["cost_basis_mismatch"]);
  });

  it("paper fills are never reconciled against the venue", async () => {
    const w = world();
    await w.bet(w.wallet(1), "YES");
    await prisma.fill.updateMany({ data: { isSimulated: true } });
    w.account.trades = [];
    w.account.balances.clear();
    const result = await w.reconcile();
    expect(kinds(result.findings)).toEqual([]);
    expect(kinds(result.findings, "info")).toContain("not_reconcilable_simulated");
  });

  it("tokens with orders still awaiting the venue are indeterminate, not missing", async () => {
    const w = world();
    const opened = await w.bet(w.wallet(1), "YES");
    await prisma.execution.updateMany({ where: { position: { predictionId: opened.id } }, data: { status: "submitted" } });
    w.account.balances.set(w.market.clobTokenIds![0]!, 0n);
    const result = await w.reconcile();
    expect(kinds(result.findings)).not.toContain("missing_shares");
    expect(kinds(result.findings, "info")).toContain("token_indeterminate");
  });

  it("verifies pUSD against an operator baseline", async () => {
    const w = world();
    const at = new Date(Date.now() - 60_000);
    const start = w.account.collateral;
    await w.bet(w.wallet(1), "YES");
    const ledger = await loadLedgerSnapshot(prisma);
    const venueSnap = { tokenBalances: new Map([...w.account.balances]), collateralMicros: w.account.collateral, trades: w.account.trades, tradesSince: null };
    expect(kinds(reconcileInventory(ledger, venueSnap, { ...CONFIG, usdcBaseline: { micros: start, at } }).findings)).toEqual([]);
    expect(kinds(reconcileInventory(ledger, { ...venueSnap, collateralMicros: w.account.collateral - 5_000_000n }, { ...CONFIG, usdcBaseline: { micros: start, at } }).findings)).toEqual(["usdc_balance_discrepancy"]);
  });

  it("concurrent runs: one reconciles, others skip; results are idempotent and the ledger is untouched", async () => {
    const w = world();
    await w.bet(w.wallet(1), "YES");
    await w.bet(w.wallet(2), "NO");
    w.account.trades.push({ tradeId: "ghost", orderId: "g", tokenId: w.market.clobTokenIds![1]!, side: "BUY", sharesMicros: 1_000_000n, priceBps: 5000, status: "CONFIRMED", matchedAt: new Date() });
    w.account.delayMs = 30;
    const before = await ledgerFingerprint();
    const results = await Promise.all([0, 1, 2].map(() => runInventoryReconciliation({ prisma, venue: w.venue, config: CONFIG })));
    expect(results.filter((r) => r.status === "completed")).toHaveLength(1);
    expect(results.filter((r) => r.status === "skipped")).toHaveLength(2);
    expect(await prisma.jobLease.count()).toBe(0);

    const again = await runInventoryReconciliation({ prisma, venue: w.venue, config: CONFIG });
    const first = results.find((r) => r.status === "completed")!;
    expect(again.status).toBe("completed");
    expect((again as { fingerprint: string }).fingerprint).toBe((first as { fingerprint: string }).fingerprint);
    expect(await ledgerFingerprint()).toBe(before);

    const report = await latestReconciliationReport(prisma);
    expect(report?.findings[0]).toMatchObject({ severity: "error" });
    expect(report?.findings.map((f) => f.kind)).toContain("venue_trade_not_in_ledger");
    expect(await prisma.inventoryReconciliationRun.count({ where: { status: "COMPLETED" } })).toBe(2);
  });

  it("a venue failure marks the run failed, releases the lease, and the next run succeeds; disabled without a venue", async () => {
    const w = world();
    await w.bet(w.wallet(1), "YES");
    w.account.failNextList = true;
    const failed = await runInventoryReconciliation({ prisma, venue: w.venue, config: CONFIG });
    expect(failed).toMatchObject({ status: "failed", error: "Polymarket 503" });
    expect(await prisma.jobLease.count()).toBe(0);
    expect((await runInventoryReconciliation({ prisma, venue: w.venue, config: CONFIG })).status).toBe("completed");
    expect(await runInventoryReconciliation({ prisma, venue: null })).toMatchObject({ status: "disabled" });
  });
});

describe("venue trade interpretation", () => {
  it("maps taker and maker trades to this account's side, including mint/merge maker legs", () => {
    const account = { funder: "0xfunder", owner: "api-key" };
    const trades = tradesForAccount(
      [
        { id: "t1", trader_side: "TAKER", side: "BUY", asset_id: "yes", size: "10", price: "0.5", taker_order_id: "o1", status: "CONFIRMED", match_time: "1789000000" },
        { id: "t2", trader_side: "MAKER", side: "BUY", asset_id: "yes", size: "7", price: "0.5", status: "MATCHED", match_time: "1789000000", maker_orders: [
          { order_id: "m1", maker_address: "0xFUNDER", matched_amount: "3", price: "0.51", asset_id: "yes" },
          { order_id: "m2", maker_address: "0xsomeone", matched_amount: "4", price: "0.52", asset_id: "yes" },
        ] },
        { id: "t3", trader_side: "MAKER", side: "BUY", asset_id: "yes", size: "5", price: "0.6", status: "MATCHED", match_time: "1789000000", maker_orders: [
          { order_id: "m3", owner: "API-KEY", matched_amount: "5", price: "0.4", asset_id: "no" },
        ] },
      ],
      account,
    );
    expect(trades).toEqual([
      expect.objectContaining({ tradeId: "t1", tokenId: "yes", side: "BUY", sharesMicros: 10_000_000n, priceBps: 5000 }),
      expect.objectContaining({ tradeId: "t2", tokenId: "yes", side: "SELL", sharesMicros: 3_000_000n, priceBps: 5100, orderId: "m1" }),
      expect.objectContaining({ tradeId: "t3", tokenId: "no", side: "BUY", sharesMicros: 5_000_000n, priceBps: 4000 }),
    ]);
  });

  it("parses recorded venue references", () => {
    expect(venueReference("t2,t1")).toEqual({ kind: "trades", tradeIds: ["t1", "t2"] });
    expect(venueReference("t9:order-3")).toEqual({ kind: "trades", tradeIds: ["t9"] });
    expect(venueReference("order:abc")).toEqual({ kind: "order", orderId: "abc" });
  });
});

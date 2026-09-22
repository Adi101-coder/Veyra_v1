import { describe, expect, it, vi } from "vitest";
import { createPolymarketClient, clientFromExecutor } from "@/server/polymarket/client";
import type { OrderBookSnapshot } from "@/lib/betting";

vi.mock("@/server/polymarket/live", () => ({
  submitLiveOrder: vi.fn(async () => {
    throw new Error("submitLiveOrder must never be called for a synthetic token");
  }),
  getLiveOrder: vi.fn(async () => {
    throw new Error("getLiveOrder must never be called for an internal order id");
  }),
  findLiveActivity: vi.fn(async () => []),
}));

const book: OrderBookSnapshot = {
  tokenId: "synthetic:veyra-abc:YES",
  bids: [{ price: "0.49", size: "500" }],
  asks: [{ price: "0.51", size: "500" }],
  lastTradePrice: "0.50",
  minOrderSize: "1",
  tickSize: "0.01",
  negRisk: false,
  source: "synthetic",
};

const order = (tokenId: string) => ({
  tokenId,
  side: "BUY" as const,
  orderType: "FAK" as const,
  limitPriceBps: 5400,
  sharesMicros: 10_000_000n,
  notionalMicros: 5_100_000n,
  tickSize: "0.01",
  negRisk: false,
  book,
});

/**
 * A Split pool's token exists only in Postgres. If execution routed on mode alone,
 * flipping POLYMARKET_EXECUTION_MODE=live would send every pool order to the CLOB,
 * where the token matches nothing — the pool is the counterparty, not Polymarket.
 */
describe("synthetic tokens never reach the venue in live mode", () => {
  it("createPolymarketClient fills a pool token internally even when mode is live", async () => {
    const client = createPolymarketClient({ mode: "live" });
    const result = await client.submitOrder(order("synthetic:veyra-abc:YES"));
    expect(result.mode).toBe("paper");
    expect(result.fills.length).toBeGreaterThan(0);
    expect(result.fills.every((fill) => fill.simulated)).toBe(true);
  });

  it("createPolymarketClient still routes a real venue token to the live venue", async () => {
    const client = createPolymarketClient({ mode: "live" });
    await expect(client.submitOrder(order("71321045679252212594626385532706912750332728571942532289631379312455583992563"))).rejects.toThrow(
      /submitLiveOrder must never be called/,
    );
  });

  it("clientFromExecutor bypasses a live executor for a pool token", async () => {
    const executor = {
      mode: "live" as const,
      submit: vi.fn(async () => {
        throw new Error("executor.submit must not be reached for a synthetic token");
      }),
      getOrder: vi.fn(async () => null),
    };
    const client = clientFromExecutor(executor, async () => book);
    const result = await client.submitOrder(order("synthetic:veyra-abc:YES"));
    expect(executor.submit).not.toHaveBeenCalled();
    expect(result.fills.length).toBeGreaterThan(0);
  });

  it("does not ask the venue about an internally filled order", async () => {
    const client = createPolymarketClient({ mode: "live" });
    await expect(client.getOrder("paper_synthetic:veyra-abc:YES_1")).resolves.toBeNull();
  });
});

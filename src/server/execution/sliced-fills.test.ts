import { describe, expect, it } from "vitest";
import { paperExecutor } from "@/server/polymarket/executor";
import type { OrderBookSnapshot } from "@/lib/betting";

const book: OrderBookSnapshot = {
  tokenId: "synthetic:veyra-x:YES",
  bids: [],
  asks: Array.from({ length: 20 }, () => ({ price: "0.5100", size: "1.00" })),
  minOrderSize: "1",
  tickSize: "0.01",
  negRisk: false,
  source: "pool",
};

const slice = (clientOrderId?: string) => ({
  tokenId: "synthetic:veyra-x:YES",
  side: "BUY" as const,
  orderType: "FAK" as const,
  limitPriceBps: 5600,
  sharesMicros: 1_000_000n,
  notionalMicros: 510_000n,
  tickSize: "0.01",
  negRisk: false,
  book,
  clientOrderId,
});

/**
 * A large order is cut into slices that all write fills under ONE executionId, and
 * Fill is unique on (executionId, venueTradeId). When every slice named its first
 * fill "pool-1", nine of ten fills collided and were silently discarded: the engine
 * reported ten filled slices while the position recorded one share.
 */
describe("fills from separate slices of one execution", () => {
  it("gives every slice a distinct venue trade id", async () => {
    const executor = paperExecutor("live");
    const results = await Promise.all(
      ["slice_a", "slice_b", "slice_c"].map((id) => executor.submit(slice(id))),
    );
    const ids = results.flatMap((r) => r.fills.map((f) => f.venueTradeId));
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it("still fills when no slice id is supplied", async () => {
    const result = await paperExecutor().submit(slice(undefined));
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]?.venueTradeId).toBe("paper-1");
  });
});

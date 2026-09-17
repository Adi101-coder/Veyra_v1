import { describe, expect, it } from "vitest";
import { fillsFromTrades, mapOpenOrder, mapPostOrderResponse, takerFeeMicros } from "@/server/polymarket/live";
import { resolutionFromGamma } from "@/server/polymarket/gamma";

const buy = { side: "BUY" as const, sharesMicros: 20_000_000n, orderType: "FAK" as const };

describe("Polymarket POST /order mapping", () => {
  it("full match: shares from takingAmount, USDC from makingAmount (BUY)", () => {
    const result = mapPostOrderResponse(buy, {
      success: true,
      orderID: "0xabc",
      status: "matched",
      makingAmount: "10",
      takingAmount: "20",
      tradeIDs: ["t1"],
    });
    expect(result.status).toBe("filled");
    expect(result.fills[0]).toMatchObject({ sharesMicros: 20_000_000n, notionalMicros: 10_000_000n, priceBps: 5000 });
  });

  it("partial match on a FAK is terminal partial with the real size", () => {
    const result = mapPostOrderResponse(buy, { success: true, orderID: "0xabc", status: "matched", makingAmount: "4.2", takingAmount: "7" });
    expect(result.status).toBe("partial");
    expect(result.fills[0]?.sharesMicros).toBe(7_000_000n);
    expect(result.fills[0]?.priceBps).toBe(6000);
  });

  it("SELL reverses maker/taker amounts", () => {
    const result = mapPostOrderResponse(
      { side: "SELL", sharesMicros: 5_000_000n, orderType: "FAK" },
      { success: true, orderID: "0x1", status: "matched", makingAmount: "5", takingAmount: "2.45" },
    );
    expect(result.fills[0]).toMatchObject({ sharesMicros: 5_000_000n, notionalMicros: 2_450_000n, priceBps: 4900 });
  });

  it("accepted but resting/delayed is open with no fills (never assumed filled)", () => {
    for (const status of ["live", "delayed", "something-new"]) {
      const result = mapPostOrderResponse(buy, { success: true, orderID: "0x2", status, makingAmount: "0", takingAmount: "0" });
      expect(result.status).toBe("open");
      expect(result.fills).toEqual([]);
    }
  });

  it("errors: no order id is a rejection; an order id with an error must be reconciled", () => {
    expect(mapPostOrderResponse(buy, { success: false, errorMsg: "not enough balance" }).status).toBe("rejected");
    expect(mapPostOrderResponse(buy, { success: false, orderID: "0x3", errorMsg: "FOK not filled" }).status).toBe("unknown");
  });
});

describe("Polymarket order reconciliation", () => {
  const trades = [
    { id: "t1", taker_order_id: "o1", size: "3", price: "0.5", status: "TRADE_STATUS_CONFIRMED", fee_rate_bps: "0" },
    { id: "t2", taker_order_id: "o1", size: "2", price: "0.52", status: "MATCHED" },
    { id: "t3", taker_order_id: "o1", size: "9", price: "0.5", status: "TRADE_STATUS_FAILED" },
    { id: "t4", taker_order_id: "x", maker_orders: [{ order_id: "o1", matched_amount: "1", price: "0.49" }] },
  ];

  it("collects taker and maker fills, skipping failed trades", () => {
    const fills = fillsFromTrades("o1", trades);
    expect(fills.map((fill) => fill.sharesMicros)).toEqual([3_000_000n, 2_000_000n, 1_000_000n]);
    expect(fills.map((fill) => fill.venueTradeId)).toEqual(["t1", "t2", "t4:o1"]);
  });

  it("LIVE with partial matches stays open; CANCELED after partial is terminal partial", () => {
    const fills = fillsFromTrades("o1", trades);
    expect(mapOpenOrder({ id: "o1", status: "LIVE", original_size: "10", size_matched: "6" }, "o1", fills).status).toBe("open");
    expect(mapOpenOrder({ id: "o1", status: "CANCELED", original_size: "10", size_matched: "6" }, "o1", fills).status).toBe("partial");
    expect(mapOpenOrder({ id: "o1", status: "MATCHED", original_size: "6", size_matched: "6" }, "o1", fills).status).toBe("filled");
    expect(mapOpenOrder({ id: "o1", status: "CANCELED_MARKET_RESOLVED", original_size: "6", size_matched: "0" }, "o1", []).status).toBe("rejected");
  });

  it("does not finalize while trade pages lag size_matched", () => {
    const lagging = fillsFromTrades("o1", trades.slice(0, 1));
    expect(mapOpenOrder({ id: "o1", status: "MATCHED", original_size: "6", size_matched: "6" }, "o1", lagging).status).toBe("open");
  });

  it("taker fee follows shares x rate x p x (1-p)", () => {
    // 100 shares at 0.50 with a 7% rate: 100 * 0.07 * 0.25 = 1.75 USDC
    expect(takerFeeMicros(100_000_000n, 5000, "700")).toBe(1_750_000n);
    expect(takerFeeMicros(100_000_000n, 5000, undefined)).toBe(0n);
  });
});

describe("Gamma resolution", () => {
  it("resolves only when closed and UMA resolved", () => {
    expect(resolutionFromGamma({ closed: false, umaResolutionStatus: "resolved", outcomes: '["Yes","No"]', outcomePrices: '["1","0"]' })).toEqual({ resolved: false });
    expect(resolutionFromGamma({ closed: true, umaResolutionStatus: "proposed", outcomes: '["Yes","No"]', outcomePrices: '["1","0"]' })).toEqual({ resolved: false });
    expect(resolutionFromGamma({ closed: true, umaResolutionStatus: "resolved", outcomes: '["Yes","No"]', outcomePrices: '["0","1"]' })).toEqual({ resolved: true, outcome: "NO" });
    expect(resolutionFromGamma({ closed: true, umaResolutionStatus: "resolved", outcomes: '["Yes","No"]', outcomePrices: '["1","0"]' })).toEqual({ resolved: true, outcome: "YES" });
    expect(resolutionFromGamma({ closed: true, umaResolutionStatus: "resolved", outcomes: '["Yes","No"]', outcomePrices: '["0.5","0.5"]' })).toEqual({ resolved: true, outcome: "INVALID" });
  });
});

import { describe, expect, it } from "vitest";
import { mapDataHolders, mapDataPositions, mapDataTrades } from "@/lib/polymarket";

describe("Polymarket public data mapping", () => {
  it("maps v1 trade arrays and v2 { data } envelopes", () => {
    const v1 = mapDataTrades(
      [
        {
          proxyWallet: "0xabcdef0123456789abcdef0123456789abcdef01",
          side: "BUY",
          size: 10,
          price: 0.42,
          timestamp: Date.now(),
          title: "Will it rain?",
          slug: "will-it-rain",
          outcome: "Yes",
          transactionHash: "0xabc",
        },
      ],
      8,
    );
    const v2 = mapDataTrades(
      {
        data: [
          {
            proxy_wallet: "0xabcdef0123456789abcdef0123456789abcdef01",
            side: "SELL",
            size: "4",
            price: "0.6",
            timestamp: Math.floor(Date.now() / 1000),
            title: "Will it rain?",
            slug: "will-it-rain",
            outcome: "No",
            transaction_hash: "0xdef",
          },
        ],
      },
      8,
    );
    expect(v1[0]).toMatchObject({
      id: "0xabc",
      marketId: "will-it-rain",
      chance: 42,
      up: true,
      invested: "$4.20",
    });
    expect(v2[0]).toMatchObject({ marketId: "will-it-rain", chance: 60, up: false });
  });

  it("maps open positions including snake_case v2 rows", () => {
    const rows = mapDataPositions(
      {
        data: [
          {
            slug: "will-it-rain",
            title: "Will it rain?",
            outcome: "Yes",
            token_id: "99",
            current_size: 12.5,
            avg_price: 0.4,
            current_price: 0.55,
            current_value: 6.875,
            total_pnl: 1.875,
            percent_pnl: 37.5,
          },
        ],
      },
      10,
    );
    expect(rows[0]).toMatchObject({
      id: "will-it-rain:99",
      marketId: "will-it-rain",
      outcome: "Yes",
      shares: "12.50",
      avgPrice: "40¢",
      up: true,
    });
    expect(rows[0]?.pnl.startsWith("+")).toBe(true);
  });

  it("flattens holder groups by outcome token", () => {
    const holders = mapDataHolders(
      {
        data: [
          {
            outcome: "Yes",
            holders: [
              {
                wallet: "0x1111111111111111111111111111111111111111",
                name: "Ada",
                amount: "100",
                current_value: 52,
                total_pnl: 2,
              },
            ],
          },
        ],
      },
      "will-it-rain",
      8,
    );
    expect(holders).toHaveLength(1);
    expect(holders[0]).toMatchObject({
      marketId: "will-it-rain",
      trader: "Ada",
      outcome: "Yes",
      shares: "100.00",
      up: true,
    });
  });
});

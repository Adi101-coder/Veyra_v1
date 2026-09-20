import { describe, expect, it } from "vitest";
import {
  mapDataHolders,
  mapDataPositions,
  mapDataTrades,
  parseMatchupTitle,
  resolveLiveOutcomes,
} from "@/lib/polymarket";

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

describe("live outcome labels", () => {
  it("parses two-team titles into names", () => {
    expect(parseMatchupTitle("SMU vs. Louisville")).toEqual(["SMU", "Louisville"]);
    expect(parseMatchupTitle("LoL: LYON vs Cloud9 (BO5) - LCS Playoffs")).toEqual(["LYON", "Cloud9"]);
  });

  it("keeps Yes/No for genuine binary questions", () => {
    const display = resolveLiveOutcomes(
      { title: "Will it rain in Seattle tomorrow?" },
      { question: "Will it rain in Seattle tomorrow?", outcomes: '["Yes","No"]', outcomePrices: '["0.64","0.36"]' },
    );
    expect(display.outcomes).toEqual([
      { label: "Yes", chance: 64 },
      { label: "No", chance: 36 },
    ]);
  });

  it("lists tournament names from sibling markets", () => {
    const display = resolveLiveOutcomes(
      {
        title: "Which party will gain most seats?",
        markets: [
          { groupItemTitle: "United Russia", outcomes: '["Yes","No"]', outcomePrices: '["0.81","0.19"]' },
          { groupItemTitle: "Communist Party", outcomes: '["Yes","No"]', outcomePrices: '["0.12","0.88"]' },
          { groupItemTitle: "LDPR", outcomes: '["Yes","No"]', outcomePrices: '["0.05","0.95"]' },
        ],
      },
      { question: "Will United Russia gain most seats?", outcomes: '["Yes","No"]', outcomePrices: '["0.81","0.19"]' },
    );
    expect(display.title).toBe("Which party will gain most seats?");
    expect(display.outcomes.map((row) => row.label)).toEqual(["United Russia", "Communist Party", "LDPR"]);
  });

  it("uses named outcomes when the market is not Yes/No", () => {
    const display = resolveLiveOutcomes(
      { title: "LCS Playoffs" },
      { question: "Who wins?", outcomes: '["LYON","Cloud9"]', outcomePrices: '["0.61","0.39"]' },
    );
    expect(display.outcomes).toEqual([
      { label: "LYON", chance: 61 },
      { label: "Cloud9", chance: 39 },
    ]);
  });
});

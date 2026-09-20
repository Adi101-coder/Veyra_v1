import { describe, expect, it } from "vitest";
import { pinPolymarketDns, polymarketPinnedHosts } from "@/lib/polymarket-dns";

describe("pinPolymarketDns", () => {
  it("pins CLOB, Gamma and Data API hosts", () => {
    expect(polymarketPinnedHosts()).toEqual([
      "clob.polymarket.com",
      "gamma-api.polymarket.com",
      "data-api.polymarket.com",
      "relayer-v2.polymarket.com",
    ]);
    expect(() => pinPolymarketDns()).not.toThrow();
    pinPolymarketDns();
  });
});

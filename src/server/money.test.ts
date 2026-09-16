import { describe, expect, it } from "vitest";
import {
  formatPrice,
  formatShares,
  formatUsd,
  MoneyError,
  parsePriceBps,
  parseSharesMicros,
  parseUsdMicros,
  sharesCostMicros,
  sharesFromNotional,
} from "@/server/money";

describe("money", () => {
  it("parses and formats USDC without float drift", () => {
    expect(parseUsdMicros("10.50")).toBe(10_500_000n);
    expect(parseUsdMicros("1.000001")).toBe(1_000_001n);
    expect(formatUsd(10_500_000n)).toBe("10.50");
    expect(formatUsd(1n, 6)).toBe("0.000001");
  });

  it("rejects extra stake precision instead of rounding", () => {
    expect(() => parseUsdMicros("1.1234567")).toThrow(MoneyError);
  });

  it("floors venue prices onto 4 decimal ticks", () => {
    expect(parsePriceBps("0.46")).toBe(4600);
    expect(parsePriceBps("0.5")).toBe(5000);
    expect(formatPrice(5500)).toBe("0.5500");
  });

  it("computes share cost with integer mulDiv", () => {
    const shares = parseSharesMicros("30");
    expect(sharesCostMicros(shares, 5000)).toBe(15_000_000n);
    expect(sharesFromNotional(15_000_000n, 5000, 10_000n)).toBe(30_000_000n);
  });

  it("formats share lots to two display decimals", () => {
    expect(formatShares(30_000_000n)).toBe("30.00");
    expect(formatShares(12_340_000n)).toBe("12.34");
  });
});

import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { resolveOmnibusAddress } from "@/server/treasury/omnibus-onchain";

const KEY = `0x${"ab".repeat(32)}` as `0x${string}`;
const FUNDER = `0x${"cd".repeat(20)}`;

describe("resolveOmnibusAddress", () => {
  it("prefers POLYMARKET_FUNDER_ADDRESS when set", () => {
    expect(resolveOmnibusAddress({ POLYMARKET_FUNDER_ADDRESS: FUNDER, POLYMARKET_PRIVATE_KEY: KEY })).toBe(FUNDER);
  });

  it("derives the EOA from POLYMARKET_PRIVATE_KEY without 0x", () => {
    expect(resolveOmnibusAddress({ POLYMARKET_PRIVATE_KEY: KEY.slice(2) })).toBe(privateKeyToAccount(KEY).address);
  });

  it("returns null when neither is configured", () => {
    expect(resolveOmnibusAddress({})).toBeNull();
  });
});

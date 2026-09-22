import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { loadRobinhoodChainConfig } from "@/server/chain/config";

// A throwaway key generated for this test only; it holds nothing anywhere.
const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ADDRESS = privateKeyToAccount(KEY).address;

const base = {
  RH_NETWORK: "testnet",
  RH_SETTLEMENT_ENABLED: "true",
  RH_SETTLEMENT_PRIVATE_KEY: KEY,
} as unknown as NodeJS.ProcessEnv;

/**
 * The settlement signer writes receipts and nothing else. The treasury holds user
 * money and is operator-signed by hand. Pointing one key at both jobs would put
 * every deposit behind a key sitting in an env file on a server.
 */
describe("the settlement signer must not be the treasury wallet", () => {
  it("refuses when the key controls the treasury address", () => {
    expect(() =>
      loadRobinhoodChainConfig({ ...base, VEYRA_TREASURY_ADDRESS: ADDRESS } as NodeJS.ProcessEnv),
    ).toThrow(/must not be on the server/i);
  });

  it("does not leak the key in the error", () => {
    try {
      loadRobinhoodChainConfig({ ...base, VEYRA_TREASURY_ADDRESS: ADDRESS } as NodeJS.ProcessEnv);
      throw new Error("should have thrown");
    } catch (error) {
      expect(String(error)).not.toContain(KEY);
      expect(String(error).toLowerCase()).toContain(ADDRESS.toLowerCase());
    }
  });

  it("allows a separate signer", () => {
    const other = "0x1111111111111111111111111111111111111111";
    expect(() =>
      loadRobinhoodChainConfig({ ...base, VEYRA_TREASURY_ADDRESS: other } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("is case-insensitive about the address", () => {
    expect(() =>
      loadRobinhoodChainConfig({ ...base, VEYRA_TREASURY_ADDRESS: ADDRESS.toUpperCase().replace("0X", "0x") } as NodeJS.ProcessEnv),
    ).toThrow(/must not be on the server/i);
  });
});

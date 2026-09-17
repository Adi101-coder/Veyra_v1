import { describe, expect, it } from "vitest";
import {
  addChainParams,
  ChainConfigError,
  explorerTxUrl,
  isRobinhoodChainId,
  resolveNetwork,
  ROBINHOOD_CHAIN_IDS,
  ROBINHOOD_CHAINS,
  toHexChainId,
} from "@/lib/robinhood-chain";
import { loadRobinhoodChainConfig, publicChainConfig } from "@/server/chain/config";

const KEY = `0x${"11".repeat(32)}`;

describe("Robinhood Chain network definitions (docs.robinhood.com/chain/connecting)", () => {
  it("match the official chain ids, gas token and explorers", () => {
    expect(ROBINHOOD_CHAIN_IDS).toEqual({ testnet: 46630, mainnet: 4663 });
    expect(ROBINHOOD_CHAINS.testnet.id).toBe(46630);
    expect(ROBINHOOD_CHAINS.mainnet.id).toBe(4663);
    for (const chain of Object.values(ROBINHOOD_CHAINS)) {
      expect(chain.nativeCurrency.symbol).toBe("ETH");
      expect(chain.nativeCurrency.decimals).toBe(18);
    }
    expect(ROBINHOOD_CHAINS.testnet.blockExplorers?.default.url).toBe("https://explorer.testnet.chain.robinhood.com");
    expect(ROBINHOOD_CHAINS.mainnet.blockExplorers?.default.url).toBe("https://robinhoodchain.blockscout.com");
  });

  it("defaults to testnet and gates mainnet behind an explicit flag", () => {
    expect(resolveNetwork(undefined, undefined)).toBe("testnet");
    expect(resolveNetwork(" TESTNET ", undefined)).toBe("testnet");
    expect(() => resolveNetwork("mainnet", undefined)).toThrow(ChainConfigError);
    expect(resolveNetwork("mainnet", "true")).toBe("mainnet");
    expect(() => resolveNetwork("polygon", "true")).toThrow(ChainConfigError);
  });

  it("builds EIP-3085 add-chain params and explorer links", () => {
    expect(toHexChainId(46630)).toBe("0xb626");
    expect(toHexChainId(4663)).toBe("0x1237");
    const params = addChainParams(ROBINHOOD_CHAINS.testnet);
    expect(params).toMatchObject({ chainId: "0xb626", nativeCurrency: { symbol: "ETH", decimals: 18 } });
    expect(params.rpcUrls[0]).toBe("https://rpc.testnet.chain.robinhood.com");
    expect(explorerTxUrl(46630, "0xabc")).toBe("https://explorer.testnet.chain.robinhood.com/tx/0xabc");
    expect(explorerTxUrl(137, "0xabc")).toBeNull();
    expect(isRobinhoodChainId(46630, ROBINHOOD_CHAINS.testnet)).toBe(true);
    expect(isRobinhoodChainId(4663, ROBINHOOD_CHAINS.testnet)).toBe(false);
  });
});

describe("server chain config", () => {
  it("testnet uses RH_TESTNET_RPC_URL, falling back to the official public RPC", () => {
    expect(loadRobinhoodChainConfig({}).rpcSource).toBe("public");
    const config = loadRobinhoodChainConfig({ RH_TESTNET_RPC_URL: "https://robinhood-testnet.g.alchemy.com/v2/secret" });
    expect(config).toMatchObject({ network: "testnet", rpcSource: "env", settlementEnabled: false, settlementPrivateKey: null });
    expect(config.chain.id).toBe(46630);
  });

  it("mainnet requires RH_ENABLE_MAINNET and RH_RPC_URL (no public fallback)", () => {
    expect(() => loadRobinhoodChainConfig({ RH_NETWORK: "mainnet" })).toThrow(/RH_ENABLE_MAINNET/);
    expect(() => loadRobinhoodChainConfig({ RH_NETWORK: "mainnet", RH_ENABLE_MAINNET: "true" })).toThrow(/RH_RPC_URL/);
    const config = loadRobinhoodChainConfig({ RH_NETWORK: "mainnet", RH_ENABLE_MAINNET: "true", RH_RPC_URL: "https://rpc.example/key" });
    expect(config.chain.id).toBe(4663);
    // The mainnet URL is never used for testnet and vice versa.
    expect(loadRobinhoodChainConfig({ RH_RPC_URL: "https://mainnet.example" }).rpcUrl).toBe("https://rpc.testnet.chain.robinhood.com");
  });

  it("validates settlement signer config without leaking the key", () => {
    expect(() => loadRobinhoodChainConfig({ RH_SETTLEMENT_ENABLED: "true" })).toThrow(/requires RH_SETTLEMENT_PRIVATE_KEY/);
    try {
      loadRobinhoodChainConfig({ RH_SETTLEMENT_PRIVATE_KEY: "0xdeadbeef-not-a-key" });
      throw new Error("expected failure");
    } catch (error) {
      expect(String(error)).not.toContain("deadbeef");
    }
    const config = loadRobinhoodChainConfig({ RH_SETTLEMENT_ENABLED: "true", RH_SETTLEMENT_PRIVATE_KEY: KEY });
    expect(config.settlementEnabled).toBe(true);
    const exposed = JSON.stringify(publicChainConfig(loadRobinhoodChainConfig({ RH_SETTLEMENT_ENABLED: "true", RH_SETTLEMENT_PRIVATE_KEY: KEY, RH_TESTNET_RPC_URL: "https://x.example/v2/apikey" })));
    expect(exposed).not.toContain("11111111");
    expect(exposed).not.toContain("apikey");
  });

  it("rejects malformed numeric and URL settings", () => {
    expect(() => loadRobinhoodChainConfig({ RH_CONFIRMATIONS: "0" })).toThrow(ChainConfigError);
    expect(() => loadRobinhoodChainConfig({ RH_MAX_FEE_GWEI: "1.5" })).toThrow(ChainConfigError);
    expect(() => loadRobinhoodChainConfig({ RH_TESTNET_RPC_URL: "wss://feed.testnet.chain.robinhood.com" })).toThrow(/http/);
  });
});

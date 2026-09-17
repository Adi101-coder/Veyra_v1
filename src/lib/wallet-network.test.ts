import { describe, expect, it } from "vitest";
import { ROBINHOOD_CHAINS } from "@/lib/robinhood-chain";
import { parseChainId, switchWalletToChain, WalletNetworkError, type Eip1193Provider } from "@/lib/wallet-network";

function wallet(options: { chainId: number; knows?: number[]; rejectSwitch?: number; rejectAdd?: number }) {
  let current = options.chainId;
  const known = new Set(options.knows ?? [1]);
  const calls: { method: string; params?: unknown[] }[] = [];
  const provider: Eip1193Provider = {
    async request({ method, params }) {
      calls.push({ method, params });
      if (method === "eth_chainId") return `0x${current.toString(16)}`;
      if (method === "wallet_switchEthereumChain") {
        if (options.rejectSwitch) throw Object.assign(new Error("switch failed"), { code: options.rejectSwitch });
        const id = Number.parseInt((params![0] as { chainId: string }).chainId, 16);
        if (!known.has(id)) throw Object.assign(new Error("Unrecognized chain ID"), { code: 4902 });
        current = id;
        return null;
      }
      if (method === "wallet_addEthereumChain") {
        if (options.rejectAdd) throw Object.assign(new Error("add failed"), { code: options.rejectAdd });
        const id = Number.parseInt((params![0] as { chainId: string }).chainId, 16);
        known.add(id);
        current = id; // MetaMask switches after adding
        return null;
      }
      throw new Error(`unexpected ${method}`);
    },
  };
  return { provider, calls };
}

describe("wallet network detection and switching", () => {
  it("parses hex and decimal chain ids", () => {
    expect(parseChainId("0xb626")).toBe(46630);
    expect(parseChainId("4663")).toBe(4663);
    expect(parseChainId(4663)).toBe(4663);
    expect(parseChainId(null)).toBeNull();
  });

  it("switches directly when the wallet already knows Robinhood Chain", async () => {
    const { provider, calls } = wallet({ chainId: 1, knows: [1, 46630] });
    expect(await switchWalletToChain(provider, ROBINHOOD_CHAINS.testnet)).toBe(46630);
    expect(calls.map((c) => c.method)).toEqual(["wallet_switchEthereumChain", "eth_chainId"]);
  });

  it("adds the chain with official params on 4902, then verifies the switch", async () => {
    const { provider, calls } = wallet({ chainId: 1 });
    expect(await switchWalletToChain(provider, ROBINHOOD_CHAINS.testnet)).toBe(46630);
    const add = calls.find((c) => c.method === "wallet_addEthereumChain")!;
    expect(add.params![0]).toMatchObject({
      chainId: "0xb626",
      nativeCurrency: { symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://rpc.testnet.chain.robinhood.com"],
    });
  });

  it("reports user rejection and pending requests distinctly", async () => {
    await expect(switchWalletToChain(wallet({ chainId: 1, rejectSwitch: 4001 }).provider, ROBINHOOD_CHAINS.testnet)).rejects.toMatchObject({
      code: "USER_REJECTED",
    });
    await expect(switchWalletToChain(wallet({ chainId: 1, rejectAdd: 4001 }).provider, ROBINHOOD_CHAINS.testnet)).rejects.toBeInstanceOf(WalletNetworkError);
    await expect(switchWalletToChain(wallet({ chainId: 1, rejectSwitch: -32002 }).provider, ROBINHOOD_CHAINS.testnet)).rejects.toMatchObject({
      code: "PENDING_REQUEST",
    });
  });

  it("fails if the wallet silently stays on another chain", async () => {
    const stubborn: Eip1193Provider = {
      async request({ method }) {
        return method === "eth_chainId" ? "0x1" : null;
      },
    };
    await expect(switchWalletToChain(stubborn, ROBINHOOD_CHAINS.mainnet)).rejects.toMatchObject({ code: "FAILED" });
  });
});

import type { Chain } from "viem";
import { robinhood, robinhoodTestnet } from "viem/chains";

/**
 * Robinhood Chain network definitions shared by browser and server.
 *
 * Source of truth: https://docs.robinhood.com/chain/connecting (verified 2026-09-17)
 *   mainnet 4663, testnet 46630, native gas token ETH, Arbitrum L2 on Ethereum.
 * viem's built-in `robinhood` / `robinhoodTestnet` definitions match those values;
 * we build on them instead of duplicating constants.
 *
 * Browser-safe: contains only public network metadata. Private RPC URLs (with
 * provider API keys) live in server env (RH_RPC_URL / RH_TESTNET_RPC_URL).
 */

export type RobinhoodNetwork = "testnet" | "mainnet";

export const ROBINHOOD_CHAINS: Record<RobinhoodNetwork, Chain> = {
  testnet: robinhoodTestnet,
  mainnet: robinhood,
};

export const ROBINHOOD_CHAIN_IDS = {
  testnet: 46630,
  mainnet: 4663,
} as const satisfies Record<RobinhoodNetwork, number>;

export class ChainConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChainConfigError";
  }
}

/**
 * Testnet by default. Mainnet requires both network=mainnet and an explicit
 * enable flag, so a single mistyped env var cannot move settlement to mainnet.
 */
export function resolveNetwork(network: string | undefined, mainnetEnabled: string | undefined): RobinhoodNetwork {
  const value = (network ?? "testnet").trim().toLowerCase();
  if (value === "" || value === "testnet") return "testnet";
  if (value === "mainnet") {
    if (mainnetEnabled !== "true") {
      throw new ChainConfigError("Robinhood Chain mainnet requires RH_ENABLE_MAINNET=true.");
    }
    return "mainnet";
  }
  throw new ChainConfigError(`Unknown Robinhood Chain network "${network}". Use "testnet" or "mainnet".`);
}

/** Network the browser should offer; mirrors the server selection via NEXT_PUBLIC_* vars. */
export function publicRobinhoodChain(): Chain {
  try {
    return ROBINHOOD_CHAINS[
      resolveNetwork(process.env.NEXT_PUBLIC_RH_NETWORK, process.env.NEXT_PUBLIC_RH_ENABLE_MAINNET)
    ];
  } catch {
    return ROBINHOOD_CHAINS.testnet;
  }
}

export function isRobinhoodChainId(chainId: number | null | undefined, chain: Chain = publicRobinhoodChain()) {
  return chainId === chain.id;
}

export function toHexChainId(chainId: number) {
  return `0x${chainId.toString(16)}`;
}

/** EIP-3085 params for wallet_addEthereumChain (public RPC only — never a keyed URL). */
export function addChainParams(chain: Chain) {
  return {
    chainId: toHexChainId(chain.id),
    chainName: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: [...chain.rpcUrls.default.http],
    blockExplorerUrls: chain.blockExplorers?.default ? [chain.blockExplorers.default.url] : [],
  };
}

export function explorerTxUrl(chainId: number, txHash: string) {
  const chain = Object.values(ROBINHOOD_CHAINS).find((item) => item.id === chainId);
  const base = chain?.blockExplorers?.default.url;
  return base ? `${base}/tx/${txHash}` : null;
}

export function explorerAddressUrl(chainId: number, address: string) {
  const chain = Object.values(ROBINHOOD_CHAINS).find((item) => item.id === chainId);
  const base = chain?.blockExplorers?.default.url;
  return base ? `${base}/address/${address}` : null;
}

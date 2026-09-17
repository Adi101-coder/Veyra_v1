import type { Chain } from "viem";
import { ChainConfigError, resolveNetwork, ROBINHOOD_CHAINS, type RobinhoodNetwork } from "@/lib/robinhood-chain";

/**
 * Server-side Robinhood Chain configuration. Everything comes from env; nothing
 * secret is hardcoded and nothing here is ever sent to the browser as-is (use
 * `publicChainConfig`).
 *
 *   RH_NETWORK                 testnet (default) | mainnet
 *   RH_ENABLE_MAINNET          must be "true" to allow mainnet
 *   RH_TESTNET_RPC_URL         testnet JSON-RPC (e.g. Alchemy). Falls back to the
 *                              official public RPC, which the docs mark rate-limited.
 *   RH_RPC_URL                 mainnet JSON-RPC. Required for mainnet (no public fallback).
 *   RH_SETTLEMENT_ENABLED      "true" to sign and broadcast settlement attestations
 *   RH_SETTLEMENT_PRIVATE_KEY  0x-hex key of the settlement signer (server only)
 *   RH_CONFIRMATIONS           confirmations before a settlement is final (default 1)
 *   RH_MAX_FEE_GWEI            refuse to sign above this maxFeePerGas (default 5)
 *   RH_RECEIPT_TIMEOUT_MS      rebroadcast / drop detection window (default 120000)
 */
export type RobinhoodChainConfig = {
  network: RobinhoodNetwork;
  chain: Chain;
  rpcUrl: string;
  rpcSource: "env" | "public";
  settlementEnabled: boolean;
  settlementPrivateKey: `0x${string}` | null;
  confirmations: number;
  maxFeePerGasWei: bigint;
  receiptTimeoutMs: number;
  maxAttempts: number;
};

function positiveInt(value: string | undefined, fallback: number, name: string) {
  if (value == null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== value.trim()) {
    throw new ChainConfigError(`${name} must be a positive integer.`);
  }
  return parsed;
}

function httpUrl(value: string, name: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ChainConfigError(`${name} is not a valid URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ChainConfigError(`${name} must be an http(s) JSON-RPC URL.`);
  }
  return value;
}

export function loadRobinhoodChainConfig(env: Record<string, string | undefined> = process.env): RobinhoodChainConfig {
  const network = resolveNetwork(env.RH_NETWORK, env.RH_ENABLE_MAINNET);
  const chain = ROBINHOOD_CHAINS[network];

  const envRpc = network === "mainnet" ? env.RH_RPC_URL : env.RH_TESTNET_RPC_URL;
  if (network === "mainnet" && !envRpc) {
    throw new ChainConfigError("RH_RPC_URL is required for Robinhood Chain mainnet.");
  }
  const rpcUrl = envRpc ? httpUrl(envRpc, network === "mainnet" ? "RH_RPC_URL" : "RH_TESTNET_RPC_URL") : chain.rpcUrls.default.http[0]!;

  const settlementEnabled = env.RH_SETTLEMENT_ENABLED === "true";
  const rawKey = env.RH_SETTLEMENT_PRIVATE_KEY?.trim() || null;
  let settlementPrivateKey: `0x${string}` | null = null;
  if (rawKey) {
    const normalized = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
      // Never echo the value.
      throw new ChainConfigError("RH_SETTLEMENT_PRIVATE_KEY must be a 32-byte hex private key.");
    }
    settlementPrivateKey = normalized as `0x${string}`;
  }
  if (settlementEnabled && !settlementPrivateKey) {
    throw new ChainConfigError("RH_SETTLEMENT_ENABLED=true requires RH_SETTLEMENT_PRIVATE_KEY.");
  }

  const maxFeeGwei = positiveInt(env.RH_MAX_FEE_GWEI, 5, "RH_MAX_FEE_GWEI");
  return {
    network,
    chain,
    rpcUrl,
    rpcSource: envRpc ? "env" : "public",
    settlementEnabled,
    settlementPrivateKey,
    confirmations: positiveInt(env.RH_CONFIRMATIONS, 1, "RH_CONFIRMATIONS"),
    maxFeePerGasWei: BigInt(maxFeeGwei) * 1_000_000_000n,
    receiptTimeoutMs: positiveInt(env.RH_RECEIPT_TIMEOUT_MS, 120_000, "RH_RECEIPT_TIMEOUT_MS"),
    maxAttempts: positiveInt(env.RH_SETTLEMENT_MAX_ATTEMPTS, 5, "RH_SETTLEMENT_MAX_ATTEMPTS"),
  };
}

/** Safe to return from an API: no RPC URL (may embed an API key) and no key material. */
export function publicChainConfig(config: RobinhoodChainConfig) {
  return {
    network: config.network,
    chainId: config.chain.id,
    chainName: config.chain.name,
    nativeCurrency: config.chain.nativeCurrency,
    explorerUrl: config.chain.blockExplorers?.default.url ?? null,
    rpcSource: config.rpcSource,
    settlementEnabled: config.settlementEnabled,
    confirmations: config.confirmations,
  };
}

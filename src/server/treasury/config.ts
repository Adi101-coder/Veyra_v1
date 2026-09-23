import "server-only";

import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { BettingError } from "@/server/errors";

/**
 * The two wallets, kept apart by construction.
 *
 * 1. Deposit/Treasury wallet — where users send tokenized assets (NVDA, AMD, ...).
 *    Veyra stores only its ADDRESS. There is deliberately no treasury private key
 *    env var: the server cannot move treasury funds, so the execution path cannot
 *    reach them even by mistake. Ownership lives in the ledger, not on-chain.
 *
 * 2. Polymarket execution wallet — the omnibus signer (POLYMARKET_PRIVATE_KEY /
 *    POLYMARKET_FUNDER_ADDRESS) used only to trade on the CLOB. It is funded
 *    separately and never credited from treasury deposits.
 *
 * `validateEnvironment` refuses to boot if the two addresses are the same.
 */

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_KEY = /^(0x)?[0-9a-fA-F]{64}$/;

export type SupportedAsset = {
  /** Ticker as users see it, e.g. "NVDA". */
  symbol: string;
  /** Token contract on the deposit chain. */
  contract: string;
  chainId: number;
  /** On-chain decimals, so base units round-trip exactly. */
  decimals: number;
};

/**
 * Supported deposit assets, from VEYRA_TREASURY_ASSETS as
 * `SYMBOL:contract:chainId:decimals`, comma-separated. Unset means deposits are
 * disabled, which is the safe default: an unrecognised asset is never credited.
 */
export function loadSupportedAssets(env: NodeJS.ProcessEnv = process.env): SupportedAsset[] {
  const raw = (env.VEYRA_TREASURY_ASSETS ?? "").trim();
  if (!raw) return [];
  const assets: SupportedAsset[] = [];
  for (const entry of raw.split(",")) {
    const part = entry.trim();
    if (!part) continue;
    const [symbol, contract, chainId, decimals] = part.split(":").map((s) => s?.trim() ?? "");
    if (!symbol || !EVM_ADDRESS.test(contract ?? "")) {
      throw new BettingError("TREASURY_CONFIG", `Malformed VEYRA_TREASURY_ASSETS entry: ${part}`, 500);
    }
    const chain = Number.parseInt(chainId ?? "", 10);
    const dec = Number.parseInt(decimals ?? "", 10);
    if (!Number.isInteger(chain) || chain <= 0 || !Number.isInteger(dec) || dec < 0 || dec > 36) {
      throw new BettingError("TREASURY_CONFIG", `Malformed VEYRA_TREASURY_ASSETS entry: ${part}`, 500);
    }
    assets.push({ symbol: symbol.toUpperCase(), contract: contract!.toLowerCase(), chainId: chain, decimals: dec });
  }
  return assets;
}

export function findAsset(symbol: string, env: NodeJS.ProcessEnv = process.env) {
  const wanted = symbol.trim().toUpperCase();
  return loadSupportedAssets(env).find((asset) => asset.symbol === wanted) ?? null;
}

/** The treasury address, or null when deposits are not configured. */
export function treasuryAddress(env: NodeJS.ProcessEnv = process.env) {
  const value = (env.VEYRA_TREASURY_ADDRESS ?? "").trim().toLowerCase();
  if (!value) return null;
  if (!EVM_ADDRESS.test(value)) {
    throw new BettingError("TREASURY_CONFIG", "VEYRA_TREASURY_ADDRESS is not a valid EVM address.", 500);
  }
  return value;
}

/**
 * 3. Hot payout wallet — pays withdrawals automatically, within caps. Normally a
 *    separate float; it may be the treasury itself, which `validateEnvironment`
 *    allows with a boot warning. It must never be the execution or receipt signer.
 */
export function payoutAccount(env: Record<string, string | undefined> = process.env): PrivateKeyAccount | null {
  const key = (env.VEYRA_PAYOUT_PRIVATE_KEY ?? "").trim();
  if (!HEX_KEY.test(key)) return null;
  return privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
}

/**
 * The execution wallet's public address only. Never returns, logs or derives
 * anything from the private key.
 */
export function executionFunderAddress(env: NodeJS.ProcessEnv = process.env) {
  const value = (env.POLYMARKET_FUNDER_ADDRESS ?? "").trim().toLowerCase();
  return EVM_ADDRESS.test(value) ? value : null;
}

/**
 * True when treasury and execution are provably distinct wallets. Callers that
 * move value must refuse to act when this is false.
 */
export function walletsAreSeparate(env: NodeJS.ProcessEnv = process.env) {
  const treasury = treasuryAddress(env);
  const execution = executionFunderAddress(env);
  if (!treasury) return false;
  if (!execution) return true; // execution wallet is an EOA; no shared address to collide with
  return treasury !== execution;
}

export function assertWalletsAreSeparate(env: NodeJS.ProcessEnv = process.env) {
  if (!treasuryAddress(env)) {
    throw new BettingError("TREASURY_DISABLED", "Treasury deposits are not configured.", 503);
  }
  if (!walletsAreSeparate(env)) {
    throw new BettingError(
      "TREASURY_CONFIG",
      "Treasury and Polymarket execution wallets must be different addresses.",
      500,
    );
  }
}

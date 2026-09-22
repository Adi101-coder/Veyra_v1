import { createHmac } from "node:crypto";
import { pinPolymarketDns } from "@/lib/polymarket-dns";
import { BettingError } from "@/server/errors";
import { DEPOSIT_WALLET_FACTORY } from "@/server/polymarket/deposit-wallet";

const RELAYER = process.env.POLYMARKET_RELAYER_URL ?? "https://relayer-v2.polymarket.com";

function builderSignature(secret: string, timestamp: string, method: string, path: string, body: string) {
  const key = Buffer.from(secret, "base64");
  const digest = createHmac("sha256", key)
    .update(timestamp + method + path + body)
    .digest("base64");
  return digest.replaceAll("+", "-").replaceAll("/", "_");
}

export function hasBuilderApiKey(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(
    env.POLYMARKET_BUILDER_API_KEY?.trim() &&
      env.POLYMARKET_BUILDER_SECRET?.trim() &&
      env.POLYMARKET_BUILDER_PASSPHRASE?.trim(),
  );
}

/** Gasless WALLET-CREATE through Polymarket's relayer (operator-gated factory). */
export async function relayerCreateDepositWallet(owner: `0x${string}`, env: NodeJS.ProcessEnv = process.env) {
  const key = env.POLYMARKET_BUILDER_API_KEY?.trim();
  const secret = env.POLYMARKET_BUILDER_SECRET?.trim();
  const passphrase = env.POLYMARKET_BUILDER_PASSPHRASE?.trim();
  if (!key || !secret || !passphrase) {
    throw new BettingError(
      "DEPOSIT_WALLET",
      "Polymarket will not take this EOA as a maker. Create Builder API keys at polymarket.com → Settings → Builders and set POLYMARKET_BUILDER_API_KEY, POLYMARKET_BUILDER_SECRET, and POLYMARKET_BUILDER_PASSPHRASE. That deploys the deposit wallet; you still place the wager in Split.",
      503,
    );
  }
  pinPolymarketDns();
  const path = "/submit";
  const method = "POST";
  const body = JSON.stringify({
    type: "WALLET-CREATE",
    from: owner,
    to: DEPOSIT_WALLET_FACTORY,
    metadata: "Deploy Deposit Wallet",
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const response = await fetch(`${RELAYER}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      POLY_BUILDER_API_KEY: key,
      POLY_BUILDER_TIMESTAMP: timestamp,
      POLY_BUILDER_PASSPHRASE: passphrase,
      POLY_BUILDER_SIGNATURE: builderSignature(secret, timestamp, method, path, body),
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await response.json().catch(() => ({}))) as { transactionID?: string; error?: string; message?: string };
  if (!response.ok) {
    throw new BettingError(
      "DEPOSIT_WALLET",
      json.error || json.message || `Polymarket relayer ${response.status}`,
      response.status >= 400 && response.status < 500 ? response.status : 502,
    );
  }
  return json;
}

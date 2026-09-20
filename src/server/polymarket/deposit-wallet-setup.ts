import "server-only";

import { createPublicClient, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon, polygonAmoy } from "viem/chains";
import { BettingError } from "@/server/errors";
import { deriveBeaconDepositWallet } from "@/server/polymarket/deposit-wallet";
import { hasBuilderApiKey, relayerCreateDepositWallet } from "@/server/polymarket/relayer";

function chainOf(env: NodeJS.ProcessEnv): Chain {
  return env.POLYMARKET_CHAIN_ID === "80002" ? polygonAmoy : polygon;
}

async function waitForCode(
  address: `0x${string}`,
  rpc: string,
  chain: Chain,
  attempts = 20,
): Promise<boolean> {
  const client = createPublicClient({ chain, transport: http(rpc) });
  for (let i = 0; i < attempts; i += 1) {
    const code = await client.getCode({ address });
    if (code && code !== "0x") return true;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  return false;
}

/**
 * Production CLOB rejects EOA makers. Resolve (and if needed deploy) the
 * deterministic deposit wallet, then move USDC.e onto it so the maker can trade.
 */
export async function ensureDepositWalletTrading(env: NodeJS.ProcessEnv = process.env): Promise<{
  funder: `0x${string}`;
  signatureType: 3;
}> {
  const key = env.POLYMARKET_PRIVATE_KEY?.trim();
  if (!key) {
    throw new BettingError("LIVE_NOT_CONFIGURED", "Live execution is not configured.", 503);
  }
  const privateKey = (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);
  const configured = (env.POLYMARKET_FUNDER_ADDRESS ?? "").trim() as `0x${string}` | "";
  const funder = (configured || deriveBeaconDepositWallet(account.address)) as `0x${string}`;
  const rpc = (env.POLYGON_RPC_URL ?? "").trim();
  const chain = chainOf(env);
  if (!rpc) {
    throw new BettingError("LIVE_NOT_CONFIGURED", "POLYGON_RPC_URL is required to use a Polymarket deposit wallet.", 503);
  }

  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  const existing = await publicClient.getCode({ address: funder });
  if (!existing || existing === "0x") {
    if (!hasBuilderApiKey(env)) {
      throw new BettingError(
        "DEPOSIT_WALLET",
        "Polymarket rejected this EOA as a maker. Create Builder API keys at polymarket.com → Settings → Builders (not a trade), set POLYMARKET_BUILDER_API_KEY/SECRET/PASSPHRASE, restart, and place again in Veyra.",
        503,
      );
    }
    await relayerCreateDepositWallet(account.address, env);
    const ready = await waitForCode(funder, rpc, chain);
    if (!ready) {
      throw new BettingError(
        "DEPOSIT_WALLET",
        "Polymarket accepted the deposit-wallet deploy but the contract is not on Polygon yet. Wait a few seconds and retry.",
        503,
      );
    }
  }

  return { funder, signatureType: 3 };
}

import "server-only";

import { createPublicClient, erc20Abi, formatUnits, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon, polygonAmoy } from "viem/chains";

/** Bridged USDC.e — Polymarket collateral on Polygon. */
export const POLYGON_USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;
/** Native Circle USDC on Polygon. */
export const POLYGON_USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;

/** Spenders that must be approved to trade USDC.e on Polymarket (Polygon). */
export const POLYMARKET_USDC_SPENDERS = [
  { name: "ctfExchange", address: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as const },
  { name: "negRiskExchange", address: "0xC5d563A36AE78145C45a50134d48A1215220f80a" as const },
] as const;

export type OmnibusOnchainSnapshot = {
  address: `0x${string}`;
  chainId: number;
  nativeWei: string;
  nativeFormatted: string;
  usdcEMicros: string;
  usdcEFormatted: string;
  usdcMicros: string;
  usdcFormatted: string;
  allowances: { name: string; spender: string; usdcE: string }[];
  tradingApproved: boolean;
  checkedAt: string;
};

let lastSnapshot: OmnibusOnchainSnapshot | null = null;
let lastError: string | null = null;

export function lastOmnibusOnchain() {
  return { snapshot: lastSnapshot, error: lastError };
}

/** Env as a plain record: callers pass literals, which NodeJS.ProcessEnv rejects. */
type EnvRecord = Record<string, string | undefined>;

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_KEY = /^(0x)?[0-9a-fA-F]{64}$/;

/**
 * Funder address when signature types 1–3 set one; otherwise the EOA from
 * POLYMARKET_PRIVATE_KEY. Returns null when neither is configured.
 */
export function resolveOmnibusAddress(env: EnvRecord = process.env): `0x${string}` | null {
  const funder = (env.POLYMARKET_FUNDER_ADDRESS ?? "").trim();
  if (EVM_ADDRESS.test(funder)) return funder as `0x${string}`;
  const key = (env.POLYMARKET_PRIVATE_KEY ?? "").trim();
  if (!HEX_KEY.test(key)) return null;
  const privateKey = (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
  return privateKeyToAccount(privateKey).address;
}

function polygonChain(env: EnvRecord): Chain {
  return env.POLYMARKET_CHAIN_ID === "80002" ? polygonAmoy : polygon;
}

export async function readOmnibusOnchain(env: EnvRecord = process.env): Promise<OmnibusOnchainSnapshot | null> {
  const address = resolveOmnibusAddress(env);
  const rpc = (env.POLYGON_RPC_URL ?? "").trim();
  if (!address || !rpc) {
    lastError = address ? "POLYGON_RPC_URL is unset" : "No omnibus address (private key or funder)";
    return null;
  }

  const chain = polygonChain(env);
  const client = createPublicClient({ chain, transport: http(rpc) });
  const [nativeWei, usdcE, usdc, ...allowanceRaw] = await Promise.all([
    client.getBalance({ address }),
    client.readContract({
      address: POLYGON_USDC_E,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    }),
    client.readContract({
      address: POLYGON_USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    }),
    ...POLYMARKET_USDC_SPENDERS.map((spender) =>
      client.readContract({
        address: POLYGON_USDC_E,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, spender.address],
      }),
    ),
  ]);

  const allowances = POLYMARKET_USDC_SPENDERS.map((spender, index) => ({
    name: spender.name,
    spender: spender.address,
    usdcE: allowanceRaw[index]!.toString(),
  }));

  const snapshot: OmnibusOnchainSnapshot = {
    address,
    chainId: chain.id,
    nativeWei: nativeWei.toString(),
    nativeFormatted: formatUnits(nativeWei, 18),
    usdcEMicros: usdcE.toString(),
    usdcEFormatted: formatUnits(usdcE, 6),
    usdcMicros: usdc.toString(),
    usdcFormatted: formatUnits(usdc, 6),
    allowances,
    tradingApproved: allowances.some((row) => BigInt(row.usdcE) >= usdcE && usdcE > 0n),
    checkedAt: new Date().toISOString(),
  };
  lastSnapshot = snapshot;
  lastError = null;
  return snapshot;
}

/** Worker step: read-only on-chain check. Skips when address or RPC is missing. */
export async function checkOmnibusOnchain() {
  const snapshot = await readOmnibusOnchain();
  if (!snapshot) return 0;
  console.info("[worker] omnibus on-chain", {
    address: snapshot.address,
    chainId: snapshot.chainId,
    pol: snapshot.nativeFormatted,
    usdcE: snapshot.usdcEFormatted,
    usdc: snapshot.usdcFormatted,
    tradingApproved: snapshot.tradingApproved,
  });
  return 1;
}

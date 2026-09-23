import "server-only";

import { createPublicClient, erc20Abi, formatUnits, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon, polygonAmoy } from "viem/chains";

/** Bridged USDC.e. No longer CLOB collateral: it must be wrapped into pUSD first. */
export const POLYGON_USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;
/** Native Circle USDC on Polygon. */
export const POLYGON_USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;

/** Exchanges that pull pUSD collateral; every one must be approved or some markets refuse orders. */
const COLLATERAL_SPENDERS = ["exchangeV2", "negRiskExchangeV2", "exchangeV3"] as const;

export type OmnibusOnchainSnapshot = {
  address: `0x${string}`;
  chainId: number;
  nativeWei: string;
  nativeFormatted: string;
  pusdMicros: string;
  pusdFormatted: string;
  usdcEMicros: string;
  usdcEFormatted: string;
  usdcMicros: string;
  usdcFormatted: string;
  allowances: { name: string; spender: string; pusd: string }[];
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
  const { getContractConfig } = await import("@polymarket/clob-client-v2");
  const contracts = getContractConfig(chain.id);
  const pusdToken = contracts.collateral as `0x${string}`;
  const spenders = COLLATERAL_SPENDERS.map((name) => ({ name, address: contracts[name] as `0x${string}` }));
  const [nativeWei, pusd, usdcE, usdc, ...allowanceRaw] = await Promise.all([
    client.getBalance({ address }),
    client.readContract({
      address: pusdToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    }),
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
    ...spenders.map((spender) =>
      client.readContract({
        address: pusdToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, spender.address],
      }),
    ),
  ]);

  const allowances = spenders.map((spender, index) => ({
    name: spender.name,
    spender: spender.address,
    pusd: allowanceRaw[index]!.toString(),
  }));

  const snapshot: OmnibusOnchainSnapshot = {
    address,
    chainId: chain.id,
    nativeWei: nativeWei.toString(),
    nativeFormatted: formatUnits(nativeWei, 18),
    pusdMicros: pusd.toString(),
    pusdFormatted: formatUnits(pusd, 6),
    usdcEMicros: usdcE.toString(),
    usdcEFormatted: formatUnits(usdcE, 6),
    usdcMicros: usdc.toString(),
    usdcFormatted: formatUnits(usdc, 6),
    allowances,
    tradingApproved: pusd > 0n && allowances.every((row) => BigInt(row.pusd) >= pusd),
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
    pusd: snapshot.pusdFormatted,
    usdcE: snapshot.usdcEFormatted,
    usdc: snapshot.usdcFormatted,
    tradingApproved: snapshot.tradingApproved,
  });
  return 1;
}

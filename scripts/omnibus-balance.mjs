/**
 * Live on-chain balances for the Polymarket omnibus (vault) on Polygon.
 * Usage: npm run worker:balance
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon, polygonAmoy } from "viem/chains";

const USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const SPENDERS = [
  ["ctfExchange", "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"],
  ["negRiskExchange", "0xC5d563A36AE78145C45a50134d48A1215220f80a"],
];
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_KEY = /^(0x)?[0-9a-fA-F]{64}$/;

function loadEnv(file) {
  const env = {};
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return env;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const fromFile = loadEnv(resolve(process.cwd(), ".env"));
const env = { ...process.env };
for (const [key, value] of Object.entries(fromFile)) {
  if (!env[key]) env[key] = value;
}

function omnibusAddress() {
  const funder = (env.POLYMARKET_FUNDER_ADDRESS ?? "").trim();
  if (EVM_ADDRESS.test(funder)) return funder;
  const key = (env.POLYMARKET_PRIVATE_KEY ?? "").trim();
  if (!HEX_KEY.test(key)) return null;
  const privateKey = key.startsWith("0x") ? key : `0x${key}`;
  return privateKeyToAccount(privateKey).address;
}

const address = omnibusAddress();
const rpc = (env.POLYGON_RPC_URL ?? "").trim();
if (!address) {
  console.error("No vault address. Set POLYMARKET_PRIVATE_KEY or POLYMARKET_FUNDER_ADDRESS in .env");
  process.exit(1);
}
if (!rpc) {
  console.error("POLYGON_RPC_URL is unset in .env");
  process.exit(1);
}

const chain = env.POLYMARKET_CHAIN_ID === "80002" ? polygonAmoy : polygon;
const client = createPublicClient({ chain, transport: http(rpc) });

const [nativeWei, usdcE, usdc, ...allowances] = await Promise.all([
  client.getBalance({ address }),
  client.readContract({ address: USDC_E, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
  client.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
  ...SPENDERS.map(([, spender]) =>
    client.readContract({ address: USDC_E, abi: erc20Abi, functionName: "allowance", args: [address, spender] }),
  ),
]);

const approved = allowances.some((value) => value >= usdcE && usdcE > 0n);

console.log("Veyra omnibus vault (on-chain)");
console.log(`  address     ${address}`);
console.log(`  chain       ${chain.name} (${chain.id})`);
console.log(`  POL         ${formatUnits(nativeWei, 18)}`);
console.log(`  USDC.e/pUSD ${formatUnits(usdcE, 6)}`);
console.log(`  USDC        ${formatUnits(usdc, 6)}`);
console.log(`  approved    ${approved ? "yes (USDC.e allowance covers balance)" : "no — send a little POL and approve on Polymarket"}`);
for (let i = 0; i < SPENDERS.length; i++) {
  console.log(`  allowance   ${SPENDERS[i][0]} ${formatUnits(allowances[i], 6)} USDC.e`);
}
console.log(`  checked     ${new Date().toISOString()}`);

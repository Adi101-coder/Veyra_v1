/**
 * One-time on-chain allowances so the Veyra omnibus can trade on Polymarket's CLOB.
 * You still place the wager in Veyra. Usage: npm run worker:approve
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, erc20Abi, http, maxUint256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon, polygonAmoy } from "viem/chains";

const USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const CTF = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const SPENDERS = [
  ["ctfExchange", "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"],
  ["negRiskExchange", "0xC5d563A36AE78145C45a50134d48A1215220f80a"],
];
const HEX_KEY = /^(0x)?[0-9a-fA-F]{64}$/;

const erc1155Approve = [
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
];

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

const rawKey = (env.POLYMARKET_PRIVATE_KEY ?? "").trim();
if (!HEX_KEY.test(rawKey)) {
  console.error("POLYMARKET_PRIVATE_KEY missing in .env");
  process.exit(1);
}
const rpc = (env.POLYGON_RPC_URL ?? "").trim();
if (!rpc) {
  console.error("POLYGON_RPC_URL is unset");
  process.exit(1);
}

const account = privateKeyToAccount(rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`);
const chain = env.POLYMARKET_CHAIN_ID === "80002" ? polygonAmoy : polygon;
const publicClient = createPublicClient({ chain, transport: http(rpc) });
const wallet = createWalletClient({ account, chain, transport: http(rpc) });

console.log("Approving Polymarket contracts from Veyra omnibus");
console.log(`  address ${account.address}`);
console.log(`  chain   ${chain.name} (${chain.id})`);

const hashes = [];

for (const [name, spender] of SPENDERS) {
  const current = await publicClient.readContract({
    address: USDC_E,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, spender],
  });
  if (current > 0n) {
    console.log(`  USDC.e ${name} already approved`);
    continue;
  }
  const hash = await wallet.writeContract({
    address: USDC_E,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, maxUint256],
  });
  console.log(`  USDC.e ${name} tx ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash });
  hashes.push(hash);
}

for (const [name, spender] of SPENDERS) {
  const ok = await publicClient.readContract({
    address: CTF,
    abi: erc1155Approve,
    functionName: "isApprovedForAll",
    args: [account.address, spender],
  });
  if (ok) {
    console.log(`  CTF ${name} already approved`);
    continue;
  }
  const hash = await wallet.writeContract({
    address: CTF,
    abi: erc1155Approve,
    functionName: "setApprovalForAll",
    args: [spender, true],
  });
  console.log(`  CTF ${name} tx ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash });
  hashes.push(hash);
}

console.log(hashes.length ? `Done. ${hashes.length} transaction(s). Trade in Veyra, not on polymarket.com.` : "Already approved. Trade in Veyra.");

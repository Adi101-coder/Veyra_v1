/**
 * Deploy the Polymarket deposit wallet (POLY_1271) and move USDC.e onto it.
 * Usage: npm run worker:deposit-wallet
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  concatHex,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  erc20Abi,
  formatUnits,
  getAddress,
  getCreate2Address,
  http,
  keccak256,
  pad,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon, polygonAmoy } from "viem/chains";

const USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const FACTORY = getAddress("0x00000000000Fb5C9ADea0298D729A0CB3823Cc07");
const BEACON = getAddress("0x7A18EDfe055488A3128f01F563e5B479D92ffc3a");
const HEX_KEY = /^(0x)?[0-9a-fA-F]{64}$/;
const RELAYER = "https://relayer-v2.polymarket.com";

const ERC1967_BEACON_PREFIX = 0x6100523d8160233d3973n;
const ERC1967_BEACON_CONST3 = "0x60195155f3363d3d373d3d363d602036600436635c60da";
const ERC1967_BEACON_CONST2 = "0x1b60e01b36527fa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6c";
const ERC1967_BEACON_CONST1 = "0xb3582b35133d50545afa5036515af43d6000803e604d573d6000fd5b3d6000f3";

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

function deriveDepositWallet(owner) {
  const args = encodeAbiParameters(
    [{ type: "address" }, { type: "bytes32" }],
    [FACTORY, pad(getAddress(owner), { size: 32 })],
  );
  const argsLen = (args.length - 2) / 2;
  const combined = ERC1967_BEACON_PREFIX + (BigInt(argsLen) << 56n);
  const prefix = `0x${combined.toString(16).padStart(32, "0").slice(-20)}`;
  const initCode = concatHex([prefix, BEACON, ERC1967_BEACON_CONST3, ERC1967_BEACON_CONST2, ERC1967_BEACON_CONST1, args]);
  return getCreate2Address({ from: FACTORY, salt: keccak256(args), bytecodeHash: keccak256(initCode) });
}

function builderSignature(secret, timestamp, method, path, body) {
  const digest = createHmac("sha256", Buffer.from(secret, "base64"))
    .update(timestamp + method + path + body)
    .digest("base64");
  return digest.replaceAll("+", "-").replaceAll("/", "_");
}

const fromFile = loadEnv(resolve(process.cwd(), ".env"));
const env = { ...process.env };
for (const [key, value] of Object.entries(fromFile)) {
  if (!env[key]) env[key] = value;
}

const rawKey = (env.POLYMARKET_PRIVATE_KEY ?? "").trim();
const rpc = (env.POLYGON_RPC_URL ?? "").trim();
const builderKey = (env.POLYMARKET_BUILDER_API_KEY ?? "").trim();
const builderSecret = (env.POLYMARKET_BUILDER_SECRET ?? "").trim();
const builderPass = (env.POLYMARKET_BUILDER_PASSPHRASE ?? "").trim();

if (!HEX_KEY.test(rawKey)) {
  console.error("POLYMARKET_PRIVATE_KEY missing in .env");
  process.exit(1);
}
if (!rpc) {
  console.error("POLYGON_RPC_URL is unset");
  process.exit(1);
}
if (!builderKey || !builderSecret || !builderPass) {
  console.error("POLYMARKET_BUILDER_API_KEY/SECRET/PASSPHRASE missing in .env");
  process.exit(1);
}

const account = privateKeyToAccount(rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`);
const funder = (env.POLYMARKET_FUNDER_ADDRESS ?? "").trim() || deriveDepositWallet(account.address);
const chain = env.POLYMARKET_CHAIN_ID === "80002" ? polygonAmoy : polygon;
const publicClient = createPublicClient({ chain, transport: http(rpc) });

console.log("Veyra Polymarket deposit wallet");
console.log(`  signer  ${account.address}`);
console.log(`  wallet  ${funder}`);
console.log(`  chain   ${chain.name} (${chain.id})`);

let code = await publicClient.getCode({ address: funder });
if (code && code !== "0x") {
  console.log("  deploy  already on-chain");
} else {
  const path = "/submit";
  const method = "POST";
  const body = JSON.stringify({
    type: "WALLET-CREATE",
    from: account.address,
    to: FACTORY,
    metadata: "Deploy Deposit Wallet",
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const response = await fetch(`${RELAYER}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      POLY_BUILDER_API_KEY: builderKey,
      POLY_BUILDER_TIMESTAMP: timestamp,
      POLY_BUILDER_PASSPHRASE: builderPass,
      POLY_BUILDER_SIGNATURE: builderSignature(builderSecret, timestamp, method, path, body),
    },
    body,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`  relayer ${response.status}: ${json.error || json.message || "rejected"}`);
    process.exit(1);
  }
  console.log(`  relayer accepted${json.transactionID ? ` (${json.transactionID})` : ""}`);
  for (let i = 0; i < 20; i += 1) {
    await new Promise((r) => setTimeout(r, 1500));
    code = await publicClient.getCode({ address: funder });
    if (code && code !== "0x") break;
  }
  if (!code || code === "0x") {
    console.error("  deploy not visible on Polygon yet; retry in a few seconds");
    process.exit(1);
  }
  console.log("  deploy  on-chain");
}

const [eoaUsdc, walletUsdc] = await Promise.all([
  publicClient.readContract({ address: USDC_E, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
  publicClient.readContract({ address: USDC_E, abi: erc20Abi, functionName: "balanceOf", args: [funder] }),
]);
console.log(`  USDC.e  signer ${formatUnits(eoaUsdc, 6)} / wallet ${formatUnits(walletUsdc, 6)}`);

if (eoaUsdc > 0n && walletUsdc === 0n && funder.toLowerCase() !== account.address.toLowerCase()) {
  const wallet = createWalletClient({ account, chain, transport: http(rpc) });
  const hash = await wallet.writeContract({
    address: USDC_E,
    abi: erc20Abi,
    functionName: "transfer",
    args: [funder, eoaUsdc],
  });
  console.log(`  transfer ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash });
  const moved = await publicClient.readContract({
    address: USDC_E,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [funder],
  });
  console.log(`  USDC.e  wallet now ${formatUnits(moved, 6)}`);
}

console.log("Done. Restart npm run dev, then place the Jaguars wager in Veyra.");

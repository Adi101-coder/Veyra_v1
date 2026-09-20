/**
 * Wrap USDC.e sitting on the deposit wallet into pUSD (CLOB collateral) and
 * approve the V2/V3 exchanges. Usage: npm run worker:wrap-pusd
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  concatHex,
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  getCreate2Address,
  http,
  keccak256,
  maxUint256,
  pad,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon, polygonAmoy } from "viem/chains";

const USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const PUSD = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const ONRAMP = "0x93070a847efEf7F70739046A929D47a521F5B8ee";
const FACTORY = getAddress("0x00000000000Fb5C9ADea0298D729A0CB3823Cc07");
const BEACON = getAddress("0x7A18EDfe055488A3128f01F563e5B479D92ffc3a");
const RELAYER = "https://relayer-v2.polymarket.com";
const HEX_KEY = /^(0x)?[0-9a-fA-F]{64}$/;
const SPENDERS = [
  "0xE111180000d2663C0091e4f400237545B87B996B",
  "0xe2222d279d744050d28e00520010520000310F59",
  "0xe3333700cA9d93003F00f0F71f8515005F6c00Aa",
];

const ERC1967_BEACON_PREFIX = 0x6100523d8160233d3973n;
const ERC1967_BEACON_CONST3 = "0x60195155f3363d3d373d3d363d602036600436635c60da";
const ERC1967_BEACON_CONST2 = "0x1b60e01b36527fa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6c";
const ERC1967_BEACON_CONST1 = "0xb3582b35133d50545afa5036515af43d6000803e604d573d6000fd5b3d6000f3";

const wrapAbi = [
  { type: "function", name: "wrap", stateMutability: "nonpayable", inputs: [
    { name: "_asset", type: "address" },
    { name: "_to", type: "address" },
    { name: "_amount", type: "uint256" },
  ], outputs: [] },
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

function builderHeaders(env, method, path, body) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    "content-type": "application/json",
    POLY_BUILDER_API_KEY: env.POLYMARKET_BUILDER_API_KEY,
    POLY_BUILDER_TIMESTAMP: timestamp,
    POLY_BUILDER_PASSPHRASE: env.POLYMARKET_BUILDER_PASSPHRASE,
    POLY_BUILDER_SIGNATURE: builderSignature(env.POLYMARKET_BUILDER_SECRET, timestamp, method, path, body),
  };
}

const fromFile = loadEnv(resolve(process.cwd(), ".env"));
const env = { ...process.env };
for (const [key, value] of Object.entries(fromFile)) {
  if (!env[key]) env[key] = value;
}

const rawKey = (env.POLYMARKET_PRIVATE_KEY ?? "").trim();
const rpc = (env.POLYGON_RPC_URL ?? "").trim();
if (!HEX_KEY.test(rawKey) || !rpc) {
  console.error("POLYMARKET_PRIVATE_KEY or POLYGON_RPC_URL missing");
  process.exit(1);
}
if (!env.POLYMARKET_BUILDER_API_KEY?.trim() || !env.POLYMARKET_BUILDER_SECRET?.trim() || !env.POLYMARKET_BUILDER_PASSPHRASE?.trim()) {
  console.error("POLYMARKET_BUILDER_API_KEY/SECRET/PASSPHRASE missing");
  process.exit(1);
}

const account = privateKeyToAccount(rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`);
const funder = (env.POLYMARKET_FUNDER_ADDRESS ?? "").trim() || deriveDepositWallet(account.address);
const chain = env.POLYMARKET_CHAIN_ID === "80002" ? polygonAmoy : polygon;
const publicClient = createPublicClient({ chain, transport: http(rpc) });

const [usdce, pusd] = await Promise.all([
  publicClient.readContract({ address: USDC_E, abi: erc20Abi, functionName: "balanceOf", args: [funder] }),
  publicClient.readContract({ address: PUSD, abi: erc20Abi, functionName: "balanceOf", args: [funder] }),
]);

console.log("Wrap USDC.e → pUSD on the deposit wallet");
console.log(`  wallet ${funder}`);
console.log(`  USDC.e ${formatUnits(usdce, 6)}`);
console.log(`  pUSD   ${formatUnits(pusd, 6)}`);

async function relayerGet(path) {
  const headers = builderHeaders(env, "GET", path, "");
  const response = await fetch(`${RELAYER}${path}`, { method: "GET", headers, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || json.message || `relayer GET ${response.status}`);
  return json;
}

async function submitWallet(calls, metadata) {
  const noncePath = `/nonce?address=${account.address}&type=WALLET`;
  const nonceJson = await relayerGet(noncePath);
  const nonce = String(nonceJson.nonce ?? nonceJson ?? "0");
  const deadline = String(Math.floor(Date.now() / 1000) + 240);
  const mapped = calls.map((call) => ({
    target: getAddress(call.target),
    value: "0",
    data: call.data,
  }));
  const signature = await account.signTypedData({
    domain: { name: "DepositWallet", version: "1", chainId: chain.id, verifyingContract: funder },
    types: {
      Call: [
        { name: "target", type: "address" },
        { name: "value", type: "uint256" },
        { name: "data", type: "bytes" },
      ],
      Batch: [
        { name: "wallet", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "calls", type: "Call[]" },
      ],
    },
    primaryType: "Batch",
    message: {
      wallet: funder,
      nonce: BigInt(nonce),
      deadline: BigInt(deadline),
      calls: mapped.map((call) => ({ target: call.target, value: 0n, data: call.data })),
    },
  });
  const body = JSON.stringify({
    type: "WALLET",
    from: account.address,
    to: FACTORY,
    nonce,
    signature,
    metadata,
    depositWalletParams: { depositWallet: funder, deadline, calls: mapped },
  });
  const headers = builderHeaders(env, "POST", "/submit", body);
  const response = await fetch(`${RELAYER}/submit`, { method: "POST", headers, body });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || json.message || `relayer ${response.status}`);
  return json;
}

if (usdce > 0n) {
  const calls = [
    {
      target: USDC_E,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ONRAMP, usdce] }),
    },
    {
      target: ONRAMP,
      data: encodeFunctionData({ abi: wrapAbi, functionName: "wrap", args: [USDC_E, funder, usdce] }),
    },
  ];
  const result = await submitWallet(calls, "Wrap USDC.e to pUSD");
  console.log(`  wrap    ${result.transactionID || "accepted"}`);
  for (let i = 0; i < 20; i += 1) {
    await new Promise((r) => setTimeout(r, 1500));
    const next = await publicClient.readContract({ address: PUSD, abi: erc20Abi, functionName: "balanceOf", args: [funder] });
    if (next > pusd) {
      console.log(`  pUSD    now ${formatUnits(next, 6)}`);
      break;
    }
  }
}

const pusdNow = await publicClient.readContract({ address: PUSD, abi: erc20Abi, functionName: "balanceOf", args: [funder] });
if (pusdNow === 0n) {
  console.error("  still 0 pUSD on the deposit wallet");
  process.exit(1);
}

const approveCalls = SPENDERS.map((spender) => ({
  target: PUSD,
  data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, maxUint256] }),
}));
const approved = await submitWallet(approveCalls, "Approve pUSD for Polymarket exchanges");
console.log(`  approve ${approved.transactionID || "accepted"}`);
console.log("Done. Restart npm run dev, then place in Veyra.");

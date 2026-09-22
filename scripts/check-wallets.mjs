#!/usr/bin/env node
/**
 * Pre-flight for a live run: proves the two wallets are wired correctly WITHOUT
 * ever printing, logging or transmitting the private key.
 *
 * The key is used for exactly one local operation — deriving its public address —
 * so the address can be checked against POLYMARKET_FUNDER_ADDRESS. A mismatch
 * there means orders would be signed by one wallet and funded from another, which
 * Polymarket rejects only after the order is already in flight.
 *
 *   node scripts/check-wallets.mjs
 */
import { readFileSync } from "node:fs";
import { createPublicClient, erc20Abi, http, formatUnits } from "viem";
import { polygon } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// Load .env without pulling it into the process env any longer than needed.
const env = {};
try {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?/.exec(line);
    if (m) env[m[1]] = m[2].trim();
  }
} catch {
  fail("No .env file found. Create one first.");
  process.exit(1);
}

let problems = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { problems += 1; console.log(`  FAIL  ${m}`); };
const note = (m) => console.log(`        ${m}`);

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const KEY = /^0x[0-9a-fA-F]{64}$/;

console.log("\nWallet 1 — deposit / treasury (holds user money)");
const treasury = env.VEYRA_TREASURY_ADDRESS ?? "";
if (!treasury) fail("VEYRA_TREASURY_ADDRESS is empty.");
else if (!ADDR.test(treasury)) fail("VEYRA_TREASURY_ADDRESS is not a valid 0x address.");
else ok(`address ${treasury}`);
for (const k of Object.keys(env)) {
  if (/TREASURY.*(PRIVATE|KEY|SECRET|MNEMONIC)/.test(k) && env[k]) {
    fail(`${k} is set. The treasury key must never live on the server.`);
  }
}

console.log("\nWallet 2 — Polymarket execution (signs orders)");
const rawKey = env.POLYMARKET_PRIVATE_KEY ?? "";
const funder = env.POLYMARKET_FUNDER_ADDRESS ?? "";
let derived = null;
if (!rawKey) {
  fail("POLYMARKET_PRIVATE_KEY is empty (needed only for live mode).");
} else if (!KEY.test(rawKey)) {
  fail("POLYMARKET_PRIVATE_KEY is not 0x + 64 hex characters.");
} else {
  try {
    derived = privateKeyToAccount(rawKey).address;
    ok(`key is valid and controls ${derived}`);
    note("(the key itself is never printed, stored or sent anywhere)");
  } catch {
    fail("POLYMARKET_PRIVATE_KEY could not be parsed as a key.");
  }
}
if (!funder) fail("POLYMARKET_FUNDER_ADDRESS is empty.");
else if (!ADDR.test(funder)) fail("POLYMARKET_FUNDER_ADDRESS is not a valid 0x address.");
else if (derived && derived.toLowerCase() !== funder.toLowerCase()) {
  fail(`FUNDER_ADDRESS ${funder} is NOT the wallet this key controls (${derived}).`);
  note("Orders would be signed by one wallet and funded from another.");
} else if (derived) ok(`funder matches the signing key`);

console.log("\nSeparation");
if (treasury && derived && treasury.toLowerCase() === derived.toLowerCase()) {
  fail("Wallet 1 and wallet 2 are the SAME address. User deposits would be traded.");
} else if (treasury && derived) ok("wallet 1 and wallet 2 are different addresses");

console.log("\nMode");
const mode = (env.POLYMARKET_EXECUTION_MODE ?? "paper").toLowerCase();
console.log(`  ${mode === "live" ? "LIVE — real orders, real money" : "paper — nothing is sent to the venue"}`);
if (env.VEYRA_CUSTODY_ENABLED === "true") console.log("  custody ON — user balances move for real");

const rpc = env.POLYGON_RPC_URL ?? "";
if (!rpc) { fail("\nPOLYGON_RPC_URL is empty — balances cannot be read."); }
else {
  console.log("\nOn-chain balances (Polygon)");
  const client = createPublicClient({ chain: polygon, transport: http(rpc) });
  const USDC = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359";
  const USDCE = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";
  for (const [label, addr] of [["wallet 1 (treasury)", treasury], ["wallet 2 (execution)", funder || derived]]) {
    if (!ADDR.test(addr ?? "")) continue;
    try {
      const [native, usdc, usdce] = await Promise.all([
        client.getBalance({ address: addr }),
        client.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [addr] }),
        client.readContract({ address: USDCE, abi: erc20Abi, functionName: "balanceOf", args: [addr] }),
      ]);
      console.log(`  ${label}: ${formatUnits(usdc, 6)} USDC, ${formatUnits(usdce, 6)} USDC.e, ${formatUnits(native, 18)} POL`);
      if (label.includes("execution") && native === 0n) note("  no POL — this wallet cannot pay gas.");
    } catch (error) {
      fail(`  could not read ${label}: ${error.shortMessage ?? error.message}`);
    }
  }
}

console.log(problems === 0 ? "\nAll checks passed.\n" : `\n${problems} problem(s) to fix before going live.\n`);
process.exit(problems === 0 ? 0 : 1);

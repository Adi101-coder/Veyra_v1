#!/usr/bin/env node
/**
 * Pre-flight for a live run: proves the two wallets are wired correctly WITHOUT
 * ever printing, logging or transmitting the private key.
 *
 * The key is used for exactly one local operation — deriving its public address —
 * so the Polymarket deposit wallet it owns can be checked against
 * POLYMARKET_FUNDER_ADDRESS. A mismatch there means orders would be signed by one
 * wallet and funded from another, which Polymarket rejects only after the order is
 * already in flight.
 *
 *   node scripts/check-wallets.mjs
 */
import { readFileSync } from "node:fs";
import { createPublicClient, erc20Abi, http, formatUnits } from "viem";
import { polygon } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { collateralConfig, deriveDepositWallet } from "./lib/polymarket.mjs";

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
// The app accepts a key with or without the 0x prefix and normalises it, so this
// check must not be stricter than the thing it is checking.
const KEY = /^(0x)?[0-9a-fA-F]{64}$/;
const normalizeKey = (k) => (k.startsWith("0x") ? k : `0x${k}`);

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
    derived = privateKeyToAccount(normalizeKey(rawKey)).address;
    ok(`key is valid and controls ${derived}`);
    note("(the key itself is never printed, stored or sent anywhere)");
  } catch {
    fail("POLYMARKET_PRIVATE_KEY could not be parsed as a key.");
  }
}
const signatureType = Number(env.POLYMARKET_SIGNATURE_TYPE || "0");
const depositWallet = derived && (signatureType === 0 || signatureType === 3) ? deriveDepositWallet(derived) : null;
if (!funder) fail("POLYMARKET_FUNDER_ADDRESS is empty.");
else if (!ADDR.test(funder)) fail("POLYMARKET_FUNDER_ADDRESS is not a valid 0x address.");
else if (depositWallet && depositWallet.toLowerCase() !== funder.toLowerCase()) {
  fail(`FUNDER_ADDRESS ${funder} is NOT the deposit wallet this key owns (${depositWallet}).`);
  note("Orders would be signed by one wallet and funded from another.");
} else if (depositWallet) ok(`funder is the deposit wallet this key owns`);
else if (derived) note(`signature type ${signatureType}: cannot verify the proxy/safe funder belongs to this key`);

console.log("\nWallet 3 — Robinhood settlement signer (writes receipts only)");
const rhKey = env.RH_SETTLEMENT_PRIVATE_KEY ?? "";
let rhDerived = null;
if (!rhKey) {
  note("not set (only needed when RH_SETTLEMENT_ENABLED=true)");
} else if (!KEY.test(rhKey)) {
  fail("RH_SETTLEMENT_PRIVATE_KEY is not 64 hex characters.");
} else {
  try {
    rhDerived = privateKeyToAccount(normalizeKey(rhKey)).address;
    ok(`key is valid and controls ${rhDerived}`);
  } catch {
    fail("RH_SETTLEMENT_PRIVATE_KEY could not be parsed as a key.");
  }
}
if (env.RH_SETTLEMENT_ENABLED === "true") console.log("  settlement is ENABLED");
else note("settlement disabled — this key is not used yet");

console.log("\nSeparation");
if (treasury && derived && treasury.toLowerCase() === derived.toLowerCase()) {
  fail("Wallet 1 and wallet 2 are the SAME address. User deposits would be traded.");
} else if (treasury && derived) ok("wallet 1 and wallet 2 are different addresses");
if (treasury && rhDerived && treasury.toLowerCase() === rhDerived.toLowerCase()) {
  fail("The settlement key controls the TREASURY wallet. It holds user deposits; its key must not be on the server.");
  note("The app refuses to boot in this state. Use a fresh gas-only wallet to sign receipts.");
}
if (derived && rhDerived && derived.toLowerCase() === rhDerived.toLowerCase()) {
  note("wallet 2 and wallet 3 are the same key — workable, but a receipt signer normally holds nothing.");
}

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
  const { pusd: PUSD } = collateralConfig(polygon.id);
  for (const [label, addr] of [["wallet 1 (treasury)", treasury], ["wallet 2 (execution)", funder || derived]]) {
    if (!ADDR.test(addr ?? "")) continue;
    try {
      const [native, pusd, usdc, usdce] = await Promise.all([
        client.getBalance({ address: addr }),
        client.readContract({ address: PUSD, abi: erc20Abi, functionName: "balanceOf", args: [addr] }),
        client.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [addr] }),
        client.readContract({ address: USDCE, abi: erc20Abi, functionName: "balanceOf", args: [addr] }),
      ]);
      console.log(`  ${label}: ${formatUnits(pusd, 6)} pUSD, ${formatUnits(usdc, 6)} USDC, ${formatUnits(usdce, 6)} USDC.e, ${formatUnits(native, 18)} POL`);
      if (label.includes("execution") && usdce > 0n) note("  USDC.e is not CLOB collateral — run `npm run worker:wrap-pusd`.");
    } catch (error) {
      fail(`  could not read ${label}: ${error.shortMessage ?? error.message}`);
    }
  }
}

console.log(problems === 0 ? "\nAll checks passed.\n" : `\n${problems} problem(s) to fix before going live.\n`);
process.exit(problems === 0 ? 0 : 1);

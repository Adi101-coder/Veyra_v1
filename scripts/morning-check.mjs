/**
 * One command that says whether today's live test can run, and what to fix if not.
 *
 *   bun run morning
 *
 * Read-only. Sends nothing, signs nothing, changes nothing.
 */
import { readFileSync } from "node:fs";
import { createPublicClient, erc20Abi, http, formatUnits } from "viem";
import { polygon } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const SPENDERS = [
  ["ctfExchange", "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"],
  ["negRiskExchange", "0xC5d563A36AE78145C45a50134d48A1215220f80a"],
];

const env = {};
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?/.exec(line);
  if (m) env[m[1]] = m[2].trim();
}

let blockers = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m, fix) => { blockers += 1; console.log(`  TODO  ${m}`); if (fix) console.log(`        -> ${fix}`); };

console.log("\n1. Config");
const need = {
  VEYRA_TREASURY_ADDRESS: "the wallet users deposit into (public address only)",
  POLYMARKET_PRIVATE_KEY: "the key that signs Polymarket orders",
  POLYMARKET_FUNDER_ADDRESS: "the Polymarket deposit wallet that holds collateral",
  POLYGON_RPC_URL: "an Alchemy/Infura Polygon URL",
  POLYMARKET_BUILDER_API_KEY: "polymarket.com -> Settings -> Builders",
  POLYMARKET_BUILDER_SECRET: "same page",
  POLYMARKET_BUILDER_PASSPHRASE: "same page",
};
for (const [key, why] of Object.entries(need)) {
  if (env[key]) ok(`${key} set`); else bad(`${key} is empty`, why);
}
if (env.VEYRA_CASH_ASSET && !(env.VEYRA_TREASURY_ASSETS ?? "").toUpperCase().includes(env.VEYRA_CASH_ASSET.toUpperCase())) {
  bad(`cash asset ${env.VEYRA_CASH_ASSET} is not in VEYRA_TREASURY_ASSETS`,
      "deposits of it would credit a balance nobody can bet with");
} else if (env.VEYRA_CASH_ASSET) ok(`cash asset ${env.VEYRA_CASH_ASSET} is a supported deposit asset`);

console.log("\n2. Wallets");
let signer = null;
if (env.POLYMARKET_PRIVATE_KEY) {
  try {
    const k = env.POLYMARKET_PRIVATE_KEY;
    signer = privateKeyToAccount(k.startsWith("0x") ? k : `0x${k}`).address;
    ok(`signer ${signer}`);
  } catch { bad("POLYMARKET_PRIVATE_KEY is not a valid key"); }
}
const treasury = env.VEYRA_TREASURY_ADDRESS;
if (treasury && signer && treasury.toLowerCase() === signer.toLowerCase()) {
  bad("treasury and signer are the SAME wallet", "user deposits would be traded");
} else if (treasury && signer) ok("treasury and signer are different wallets");

console.log("\n3. Collateral and allowances (the thing that blocked us)");
const funder = env.POLYMARKET_FUNDER_ADDRESS;
if (!funder || !env.POLYGON_RPC_URL) {
  bad("cannot check without POLYMARKET_FUNDER_ADDRESS and POLYGON_RPC_URL");
} else {
  const client = createPublicClient({ chain: polygon, transport: http(env.POLYGON_RPC_URL) });
  try {
    const held = await client.readContract({ address: USDC_E, abi: erc20Abi, functionName: "balanceOf", args: [funder] });
    if (held > 0n) ok(`funder holds ${formatUnits(held, 6)} USDC.e`);
    else bad(`funder ${funder} holds no USDC.e`, `send USDC.e (${USDC_E}) to it — native USDC will not work`);
    for (const [name, spender] of SPENDERS) {
      const a = await client.readContract({ address: USDC_E, abi: erc20Abi, functionName: "allowance", args: [funder, spender] });
      if (a > 0n) ok(`${name} approved`);
      else bad(`${name} allowance is 0`,
        "connect the signer at polymarket.com and make one small trade; that sets it. Orders fail with 'not enough balance / allowance' until then");
    }
  } catch (e) { bad(`could not read chain: ${e.shortMessage ?? e.message}`); }
}

console.log(
  blockers === 0
    ? "\nReady. Start the server, then:\n  bun run e2e:live -- --market <id> --wallet <depositor> --outcome YES --confidence 80 --stake 5 --confirm\n"
    : `\n${blockers} thing(s) to fix first.\n`,
);
process.exit(blockers === 0 ? 0 : 1);

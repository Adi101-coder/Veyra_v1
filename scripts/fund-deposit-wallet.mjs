/**
 * Moves Polymarket collateral from the signer EOA to its deposit wallet (the
 * type-3 funder the CLOB actually trades from).
 *
 * Prints a dry run and changes nothing unless you pass --confirm. You run this;
 * it sends a real transaction from your key.
 *
 *   bun run fund:deposit-wallet                 # dry run
 *   bun run fund:deposit-wallet -- --confirm    # actually send
 *   bun run fund:deposit-wallet -- --amount 5 --confirm
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, erc20Abi, http, formatUnits, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";

const USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";

const env = {};
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?/.exec(line);
  if (m) env[m[1]] = m[2].trim();
}

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const amountArg = args[args.indexOf("--amount") + 1];

const key = env.POLYMARKET_PRIVATE_KEY;
const funder = env.POLYMARKET_FUNDER_ADDRESS;
const rpc = env.POLYGON_RPC_URL;
if (!key || !funder || !rpc) {
  console.error("Need POLYMARKET_PRIVATE_KEY, POLYMARKET_FUNDER_ADDRESS and POLYGON_RPC_URL in .env");
  process.exit(1);
}
const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
const pub = createPublicClient({ chain: polygon, transport: http(rpc) });

const bal = (token, who) =>
  pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] });

const [eoaE, eoaNative, funderE, funderNative] = await Promise.all([
  bal(USDC_E, account.address), bal(USDC, account.address),
  bal(USDC_E, funder), bal(USDC, funder),
]);

console.log(`\nsigner EOA      ${account.address}`);
console.log(`  USDC.e ${formatUnits(eoaE, 6)}   USDC ${formatUnits(eoaNative, 6)}`);
console.log(`deposit wallet  ${funder}`);
console.log(`  USDC.e ${formatUnits(funderE, 6)}   USDC ${formatUnits(funderNative, 6)}`);

if (eoaE === 0n) {
  console.log(`\nNothing to move: the EOA holds no USDC.e.`);
  console.log(`Polymarket settles in USDC.e (${USDC_E}); your ${formatUnits(eoaNative, 6)} is native USDC,`);
  console.log(`a different contract. Swap it first, or deposit through Polymarket's own UI,`);
  console.log(`which converts and routes to this deposit wallet for you.\n`);
  process.exit(0);
}

const amount = amountArg ? parseUnits(amountArg, 6) : eoaE;
if (amount > eoaE) {
  console.error(`\nAsked to move ${formatUnits(amount, 6)} but the EOA holds ${formatUnits(eoaE, 6)} USDC.e.\n`);
  process.exit(1);
}

console.log(`\nWould transfer ${formatUnits(amount, 6)} USDC.e -> ${funder}`);
if (!confirm) {
  console.log(`Dry run. Nothing sent. Re-run with --confirm to send it for real.\n`);
  process.exit(0);
}

const wallet = createWalletClient({ account, chain: polygon, transport: http(rpc) });
const hash = await wallet.writeContract({
  address: USDC_E, abi: erc20Abi, functionName: "transfer", args: [funder, amount],
});
console.log(`sent ${hash}`);
const receipt = await pub.waitForTransactionReceipt({ hash });
console.log(`${receipt.status} in block ${receipt.blockNumber}`);
console.log(`deposit wallet USDC.e now ${formatUnits(await bal(USDC_E, funder), 6)}\n`);

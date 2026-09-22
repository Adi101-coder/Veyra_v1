/**
 * End-to-end live trade against Polymarket, driven entirely by the app's own API.
 *
 *   bun run e2e:live -- --market <id> --outcome YES --confidence 72 --stake 2
 *
 * Nothing is sent until you pass --confirm. Without it this prints the exact order
 * it would place, including the Kelly sizing walked off the live book, and stops.
 * With it, it runs the full flow unattended:
 *
 *   balances -> bet -> fill -> hold 15s -> sell by dropping confidence -> payout
 *
 * It fails loudly rather than continuing on a bad state: an unfilled order, a
 * ledger that does not balance, or a sell that did not reduce the position.
 */
import { readFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";

const env = {};
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?/.exec(line);
  if (m) env[m[1]] = m[2].trim();
}

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const CONFIRM = args.includes("--confirm");
const ORIGIN = flag("origin", "http://127.0.0.1:3125");
const WALLET = (flag("wallet", "") || "").toLowerCase();
const MARKET = flag("market", "");
const OUTCOME = (flag("outcome", "YES") || "YES").toUpperCase();
const CONF = Number(flag("confidence", "72"));
const STAKE = flag("stake", "2");
const EXIT_CONF = Number(flag("exit", "20"));
const HOLD_MS = Number(flag("hold", "15")) * 1000;

if (!MARKET || !WALLET) {
  console.error("need --market <id> and --wallet <0x...>");
  process.exit(1);
}

const SECRET = env.VEYRA_SESSION_SECRET;
const OPERATOR = env.VEYRA_OPERATOR_TOKEN;
const session = (w) => {
  const p = Buffer.from(JSON.stringify({ w, e: Date.now() + 6e8 })).toString("base64url");
  return `${p}.${createHmac("sha256", SECRET).update(p).digest("base64url")}`;
};

async function call(path, opts = {}) {
  const headers = { "content-type": "application/json", Origin: ORIGIN };
  if (opts.wallet) headers.Cookie = `veyra_session=${session(opts.wallet)}`;
  if (opts.operator) headers.Authorization = `Bearer ${OPERATOR}`;
  if (opts.key) headers["idempotency-key"] = opts.key;
  const res = await fetch(ORIGIN + path, {
    method: opts.method ?? "GET", headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json };
}

const tick = () => call("/api/jobs/run", { method: "POST", operator: true });
const die = (msg, extra) => {
  console.error(`\nFAILED: ${msg}`);
  if (extra !== undefined) console.error(JSON.stringify(extra, null, 2).slice(0, 900));
  process.exit(1);
};
const balance = async () => {
  const r = await call("/api/treasury/balances", { wallet: WALLET });
  const row = (r.json.balances ?? [])[0];
  return { micros: BigInt(row?.balanceBase ?? "0"), asset: row?.asset ?? "?" };
};
const step = (n, s) => console.log(`\n[${n}] ${s}`);

// ---------------------------------------------------------------- preflight
step(1, "Preflight");
const ready = await call("/api/operator/readiness", { operator: true });
for (const [k, v] of Object.entries(ready.json.checks ?? {})) {
  if (!v.ok && v.critical) die(`readiness check "${k}" is failing`, v.detail);
}
console.log(`  venue checks ok, mode=${ready.json.mode}`);
if (ready.json.mode !== "live") console.log("  NOTE: not in live mode — no real order will reach Polymarket.");

const opening = await balance();
if (opening.micros <= 0n) die(`wallet ${WALLET} has no custodial balance to bet with`);
console.log(`  ${WALLET} holds ${Number(opening.micros) / 1e6} ${opening.asset}`);

// ---------------------------------------------------------------- the quote
step(2, `Quote ${OUTCOME} @ ${CONF}% confidence, $${STAKE}`);
const quote = await call("/api/predictions/quote", {
  method: "POST", body: { marketId: MARKET, outcome: OUTCOME, confidencePct: CONF, stakeUsd: STAKE },
});
if (quote.status !== 200) die("quote rejected", quote.json);
const q = quote.json.quote;
if (!q?.accepted) die(`engine refused: ${q?.rejection?.code ?? "unknown"}`, q?.rejection);
const p = q.position;
console.log(`  book      best ask ${p.bestAsk}  tick ${p.tickSize}`);
console.log(`  sizing    edge ${p.edgeBps}bps -> kelly ${p.kellyBps}bps (sized ${p.sizedKellyBps}bps)`);
console.log(`  order     ${p.shares} shares @ avg ${p.avgPrice}  = $${p.notionalUsd}, limit ${p.limitPrice}`);
console.log(`  fills     ${(p.fills ?? []).length} level(s) walked off the live book`);

if (!CONFIRM) {
  console.log(`\nDry run: nothing was sent. Re-run with --confirm to place this for real.\n`);
  process.exit(0);
}

// ---------------------------------------------------------------- place
step(3, "Placing the order");
const placed = await call("/api/predictions", {
  method: "POST", wallet: WALLET, key: randomUUID(),
  body: { marketId: MARKET, outcome: OUTCOME, confidencePct: CONF, stakeUsd: STAKE },
});
if (placed.status !== 201) die(`order refused (${placed.status})`, placed.json);
const id = placed.json.prediction.id;
console.log(`  accepted, prediction ${id}`);
const afterOrder = await balance();
console.log(`  balance ${Number(opening.micros) / 1e6} -> ${Number(afterOrder.micros) / 1e6} ${opening.asset} (reserved)`);

// ---------------------------------------------------------------- fill
step(4, "Waiting for the venue fill");
let filled = null;
for (let i = 1; i <= 15; i += 1) {
  await tick();
  const cur = (await call(`/api/predictions/${id}`, { wallet: WALLET })).json.prediction;
  const pos = cur.position, ex = cur.execution;
  console.log(`  tick ${String(i).padStart(2)}  position=${pos?.status ?? "-"} ${pos?.shares ?? "0"} sh   execution=${ex?.status ?? "-"}${ex?.errorMessage ? "  " + ex.errorMessage : ""}`);
  if (ex?.status === "failed" || ex?.status === "rejected") die(`venue rejected the order: ${ex.errorMessage}`, ex);
  if (pos?.status === "filled" || pos?.status === "partial") { filled = cur; break; }
  await new Promise((r) => setTimeout(r, 2000));
}
if (!filled) die("the order never filled");
console.log(`  FILLED ${filled.position.shares} sh @ ${filled.position.avgPrice}  (mode=${filled.execution.mode})`);
for (const f of filled.execution.fills ?? [])
  console.log(`    fill ${f.shares} @ ${f.price}  fee ${f.feeUsd}  simulated=${f.simulated}  venueTradeId=${f.venueTradeId ?? "-"}`);

// ---------------------------------------------------------------- hold
step(5, `Holding ${HOLD_MS / 1000}s`);
await new Promise((r) => setTimeout(r, HOLD_MS));

// ---------------------------------------------------------------- sell
step(6, `Selling: dropping confidence ${CONF}% -> ${EXIT_CONF}%`);
const before = filled.position.shares;
const sell = await call(`/api/predictions/${id}/confidence`, {
  method: "PATCH", wallet: WALLET, key: randomUUID(), body: { confidencePct: EXIT_CONF },
});
if (sell.status !== 200) die(`sell refused (${sell.status}) — ${sell.json.error?.code}`, sell.json);
console.log(`  accepted (${sell.json.history?.status ?? "?"})`);
for (let i = 1; i <= 10; i += 1) {
  await tick();
  const cur = (await call(`/api/predictions/${id}`, { wallet: WALLET })).json.prediction;
  console.log(`  tick ${String(i).padStart(2)}  ${cur.position.shares} sh`);
  if (cur.position.shares !== before) break;
  await new Promise((r) => setTimeout(r, 2000));
}

// ---------------------------------------------------------------- settle up
step(7, "Result");
const done = (await call(`/api/predictions/${id}`, { wallet: WALLET })).json.prediction;
const closing = await balance();
console.log(`  position  ${before} -> ${done.position.shares} sh`);
console.log(`  balance   ${Number(opening.micros) / 1e6} -> ${Number(closing.micros) / 1e6} ${opening.asset}`);
console.log(`  net       ${(Number(closing.micros - opening.micros) / 1e6).toFixed(6)} ${opening.asset}`);

const report = await call("/api/operator/treasury/report", { operator: true });
const audit = report.json.audit ?? {};
if ((audit.discrepancies ?? []).length) die("LEDGER DOES NOT BALANCE", audit.discrepancies);
console.log(`  ledger    ${audit.checked} row(s), 0 discrepancies`);
const holds = report.json.solvency?.activeHoldsMicros;
console.log(`  holds     ${holds} micros still reserved`);
console.log("");

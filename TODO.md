# What's left

State of play and what still needs doing, in the order it matters. Written to be
picked up by someone who did not build this.

Related: `CUSTODY.md` (the full custody design), `API.md` (endpoints), `AUDIT.md`
(what each subsystem guarantees), `LAUNCH.md` (deploy).

---

## Where things stand

**Working and tested:** confidence betting, Change Your Mind, smart execution against
Polymarket, reputation and calibration, conviction, inventory reconciliation, chain
settlement references, daily voting, Veyra pools with LMSR market making and a
fee-funded liquidity pool, and the UI for all of it.

**Not real money yet.** Everything trades in paper mode. Custody is partially built
and switched off.

---

## 1. Custody — the blocker for real money

Without this, a live-mode order executes against the omnibus wallet, which is Veyra's
capital. A user could bet without depositing anything. **Do not switch
`POLYMARKET_EXECUTION_MODE=live` until this is finished.**

### Built (inert, behind `VEYRA_CUSTODY_ENABLED`, default off)

- `src/server/treasury/funds.ts` — reserve, release, credit, debit. 12 tests,
  mutation-checked.
- `FundsHold` model. Placing an order debits the balance and writes the hold as the
  receipt, so `balance` always means *spendable* and the non-negative CHECK is a real
  backstop.
- Reservation wired into `createPrediction`, inside the same transaction as the order,
  so `INSUFFICIENT_FUNDS` rolls back the order row too.

### Still to build

1. **Release on terminal executions.** `releaseHold()` exists and is tested but
   nothing calls it. Needs a worker step: find executions in a terminal state whose
   hold is still `ACTIVE`, sum their fills' notional + fees, call `releaseHold`.
   Release only ever returns money, so running late is safe.
2. **Change Your Mind.** An upward adjustment creates a new execution and needs its
   own hold; a downward one sells and should credit `SELL_CREDIT` proceeds. Neither
   is wired.
3. **Resolution payouts.** Winning positions need `PAYOUT` of shares × $1, and pool
   trades a `FEE_DEBIT`. Reference `Position.id` so it is idempotent per position.
   Take the numbers from reputation's `pnlMicros` rather than recomputing profit, or
   the two will drift.
4. **Solvency reconciliation.** Σ balances + Σ holds + house capital must equal
   controlled USDC. Report, never auto-correct. **This must land before any real
   money, not after.** Note pool fills are `isSimulated`, which reconciliation
   currently scopes out — revisit or pool positions will be silently excluded.
5. **Withdrawals.** Nothing exists. `CUSTODY.md` §5.6 specs a manual operator queue
   so the server never holds a treasury key. Automating it reverses that property.
6. **Deposit watcher.** `POST /api/operator/treasury/deposits` works and is
   idempotent per `(chainId, txHash, logIndex)`; nothing watches the chain and calls
   it. Needs confirmation depth and a reversal path for reorgs.
7. **`INSUFFICIENT_FUNDS` in the UI.** The API returns 402; no screen handles it.
8. **The invariant property test.** Random sequences of place / partial fill / reject
   / sell / resolve / crash-and-retry, asserting solvency holds throughout. Model it
   on the LMSR solvency test in `src/server/pools/lmsr.test.ts`. Write it early — it
   will find ordering bugs faster than per-flow unit tests.

---

## 2. Known risks that need a decision, not code

1. **Pool resolution is operator-decided.** Someone at Veyra picks the outcome. Real
   trust burden once money is real; consider a dispute window before payouts finalise.
2. **Proposers can pick their own spot.** Users propose *and* vote the questions, vote
   budgets are per wallet, and wallets are free. Someone can propose a question they
   have private information about, vote it up, and trade against house capital. The
   per-pool cap bounds each incident, not the repetition. Cheapest first step: show
   the proposer on the pool and bar them from trading their own question while Veyra
   is the counterparty.
3. **Tokenized assets are custodied, not collateral.** Betting settles in USDC. Making
   NVDA/AMD bettable needs a price oracle, haircuts and liquidation — a different and
   much larger product.
4. **Regulatory position** on holding user funds and taking the other side of user
   trades. Answer before building custody phase 2, not after.
5. **Rate limiter and conviction cache are per-process.** On Vercel that means per
   lambda, so the effective rate limit is weaker than it looks. Needs a shared store
   before serious traffic.

---

## 3. Smaller things

- **Flaky test.** `conviction.prisma.test.ts > excludes pending, failed and flattened
  positions` intermittently times out at ~5s when the full suite runs in parallel.
  Pre-existing (reproduced on a clean checkout), not caused by the custody work.
  Passes in isolation. Likely connection-pool pressure across parallel suites; worth
  pinning `connection_limit` per test client or raising the server's
  `max_connections`.
- **Pooled Postgres unverified.** Nothing has run against a real Neon pooled URL.
  If function logs show `prepared statement "s0" already exists`, add
  `?pgbouncer=true` to `DATABASE_URL`. `DIRECT_URL` must stay unpooled.
- **Lint.** 6 pre-existing errors in `CommunityView`, `DocsView`, `Navbar`,
  `WalletProvider` (setState-in-effect). They do not block the build, since Next does
  not run ESLint during `next build`.
- **Sample sections.** The markets page's featured event, packs, leaderboards,
  trending and sport/esports rails are static mock data, hidden unless
  `NEXT_PUBLIC_VEYRA_SAMPLE_SECTIONS=true`. Either wire them to real data or delete
  them; they should not ship as-is.
- **The live Polymarket path has only ever run against scripted venues.** The small
  live test in `LAUNCH.md` §6 has never been done. Do not skip it.

---

## 4. Suggested order

1. Custody 1–4 (release, CYM, payouts, solvency) + the invariant test
2. The live test from `LAUNCH.md`, tiny caps, still paper for pools
3. Custody 5–6 (withdrawals, watcher)
4. Decide the §2 risks
5. Only then `VEYRA_CUSTODY_ENABLED=true` and real money

# What's left

State of play after the custody cash loop, solvency report, withdrawals, deposit
watcher, proposer bar, and dispute window landed. Related: `CUSTODY.md`, `API.md`,
`AUDIT.md`, `LAUNCH.md`.

---

## Where things stand

**Working and tested:** confidence betting, Change Your Mind, smart execution,
reputation, conviction, inventory, chain settlement, daily voting, Veyra pools,
custody holds / release / CYM cash / resolution PAYOUT + FEE_DEBIT, solvency
report, manual withdrawals, deposit watcher, proposer self-trade bar, pool
dispute window.

**Not real money yet.** `VEYRA_CUSTODY_ENABLED` stays off until the gates below.

---

## Human / ops gates before real money

Do **not** set `VEYRA_CUSTODY_ENABLED=true` or open live execution to users until:

1. **LAUNCH.md §6** has been run against a real Polymarket market (scripted venues
   do not count). Keep custody off and `VEYRA_MAX_STAKE_USD` tiny. Check
   `liveTestSafety()` in `src/server/launch/live-test.ts`.
2. Solvency on `GET /api/operator/treasury/report` is green on paper volume with
   `controlledSource: "onchain"`. **Leave `VEYRA_CONTROLLED_USDC_MICROS` unset** —
   it overrides the live on-chain read and makes the check self-confirming, which
   is reported as a `CONTROLLED_USDC_NOT_ONCHAIN` warning. Set `POLYGON_RPC_URL`
   and `VEYRA_TREASURY_ADDRESS` instead.
2b. `solvency.treasuryLiquidity.status` is `ok`, not `unknown`. User funds sit in
   the treasury wallet while trades run from the execution wallet, so the treasury
   drains as bets win; `sweepMicros` is how much to move back. `unknown` means the
   balance could not be read — treat it as an incident, not as healthy.
3. Withdrawal runbook rehearsed on testnet: user `POST /api/treasury/withdrawals`,
   operator sends from a wallet the server does not control, then
   `POST /api/operator/treasury/withdrawals` `complete` / `fail`.
4. **Regulatory position** written down (holding user funds + house as pool
   counterparty).
5. Tokenized equities stay **custody-only**, not collateral.
6. Shared rate-limit / conviction store (Redis) before serious multi-instance
   traffic.
7. Pools stay paper until a separate decision. Solvency already warns when
   `isSimulated` fills exist so they cannot be forgotten.

Only then: `VEYRA_CUSTODY_ENABLED=true` with tiny caps.

---

## Built in this pass (was TODO §1)

1. Release on terminal executions — worker `treasury` step, `releaseTerminalHolds`.
2. Change Your Mind — BUY reserves in `createHistoryAndExecution`; SELL credits
   `SELL_CREDIT` per fill.
3. Resolution PAYOUT / pool FEE_DEBIT from `PredictionScore`, idempotent per
   `Position.id`.
4. Solvency report — never auto-corrects.
5. Manual withdrawal queue.
6. Deposit watcher + reorg `REVERSAL` via `reverseDeposit`.
7. `INSUFFICIENT_FUNDS` copy and Balances withdrawal UI.
8. Custody invariant property test.

Also: proposer shown + cannot trade own pool; dispute window; sample market rails
removed; test client `connection_limit=2`; lint setState-in-effect fixes.

## Fixed reviewing the above against CUSTODY.md

Eight defects, all mutation-checked. Each looked correct and failed precisely in the
case it existed for — see `AUDIT.md` for the table.

Market orders posted through the limit-order SDK method; `failWithdrawal` refunding
before claiming the row; the venue fee absorbed by the house with no ledger entry;
solvency comparing the ledger to a hand-typed constant; the invariant test deriving
its own answer; reorg reversal refusing exactly when the deposit had been spent; the
deposit watcher scanning a fixed window with no cursor; one failing fee debit
freezing payouts for every user. Plus the three `§7` rows whose tests passed whether
or not the protection existed.

Added: treasury liquidity check with the exact Y→X sweep amount; fee reserved up
front; persisted per-chain scan cursor; stale-hold reporting.

## Still open

- **Sweep runbook.** The check reports the amount to move from the execution wallet
  to the treasury; the operator procedure is not written down.
- **Collateral floor for the execution wallet.** Nothing stops a sweep taking it
  below what open orders need.
- **`VEYRA_FEE_RESERVE_BPS` from observed fills.** Defaults to 200 bps; the fee
  bound holds only while it is >= the venue's real `fee_rate_bps`.

# Custody spec: making Veyra hold real money

What has to be built before Veyra can take real funds, and in what order.

Status: **holds, release, CYM cash, payouts, solvency report, withdrawals, and
deposit watcher are built**, behind `VEYRA_CUSTODY_ENABLED` (default off). Live
venue orders still must not be opened to users until the gates in §9.

Companion docs: `AUDIT.md` (what each subsystem guarantees today), `API.md` (the HTTP
surface), `LAUNCH.md` (deployment).

---

## 1. The invariant

Everything below exists to keep one statement true at all times:

> The sum of every user's balance, plus everything held against open orders, plus
> Veyra's own capital, equals the USDC actually controlled by Veyra.

If that can drift, the system is insolvent and nobody finds out until a withdrawal
fails. Every design choice here is subordinate to making the invariant checkable
continuously and provable after the fact.

Two corollaries, both already true of the position ledger and both of which must
become true of cash:

- **Money moves only from recorded facts** — a confirmed deposit, a recorded venue
  fill, a resolution. Never from intent.
- **Every movement is idempotent per cause**, so a retried worker cannot double-spend
  or double-credit.

---

## 2. What exists and what is missing

Already built and usable:

- `treasury_ledger_entries` — append-only signed deltas, unique per `(refType, refId, kind)`.
- `treasury_balances` — derived per `(wallet, asset)`, with a non-negative CHECK.
- `treasury_deposits` — idempotent per `(chainId, txHash, logIndex)`.
- `auditBalances()` — proves every balance equals the sum of its entries.
- `POST /api/operator/treasury/deposits` — credits a confirmed deposit.

Missing, in dependency order:

1. USDC as a supported deposit asset, and the concept of **buying power**.
2. **Holds** — funds reserved against an open order.
3. **Debit on fill**, inside the transaction that records the fill.
4. **Credit on resolution**, once per position.
5. **Solvency reconciliation** against real balances.
6. **Withdrawals**.
7. **A deposit watcher** that calls the endpoint that already exists.

---

## 2a. Where the implementation differs from this spec

Two deliberate deviations. Both are safe; neither matches the wording below.

**Cash moves at reserve time, not per fill (§5.2).** The spec wanted a `BET_DEBIT`
per fill, keyed `(Fill.id)`, inside `applyExecutionResult`'s transaction. The code
instead debits the full notional plus worst-case fee when the order is created, and
releases the unspent remainder once the execution is terminal. `BET_DEBIT` does not
exist. The reason: it keeps cash out of `applyExecutionResult`, the most
safety-critical function in the codebase, and a release only ever returns money — so
a delayed or crashed release is conservative, where a delayed debit is not. The
failure §5.2 guards against (a position nobody paid for) is unreachable, because the
money is taken before the order is submitted.

Consequence: `FundsHold.spentMicros` is written once at release, so while a hold is
ACTIVE it is always `0`. "Committed but not yet spent" is only known per execution,
not per fill.

**SELL credits are swept, not applied in the fill transaction (§5.4).** Same
reasoning and same direction: a delayed credit withholds a user's own money briefly
rather than letting them spend money twice.

**Fees are reserved up front.** Reserving only the notional meant a full fill cost
more than was held, the release capped the overage away, and the fee was silently
absorbed by the house with no ledger entry. Orders now reserve
`notional + feeReserveMicros(notional)`. `VEYRA_FEE_RESERVE_BPS` **must be greater
than or equal to the venue's actual fee rate**, or the cap re-opens the leak — the
bound is `fee ≤ notional × rate`, verified across all prices and rates.

## 3. Decision that shapes everything: what can be bet

The deposit assets discussed so far are tokenized equities (NVDA, AMD). Those cannot
back a bet without answering "what are they worth right now," which means a price
oracle, a collateral haircut, and a liquidation path for when the collateral falls
below the exposure. That is a margin system — a different and much larger product
than a prediction market.

**Recommendation: v1 bets settle in USDC only.** Tokenized assets can be deposited
and custodied, but are not collateral. A user who wants to bet deposits USDC, or
swaps outside Veyra and deposits the proceeds.

If tokenized collateral is required for launch, stop and scope that separately; it
roughly doubles this spec and adds a liquidation engine that can lose user money on
its own.

---

## 4. Model changes

### Buying power

```
available(wallet) = balance(wallet, "USDC") - sum(active holds)
```

`treasury_balances` already gives `balance`. Holds are new:

```prisma
model FundsHold {
  id            String   @id @default(cuid())
  walletAddress String
  executionId   String   @unique   // one hold per execution
  amountMicros  BigInt             // reserved, not yet spent
  spentMicros   BigInt   @default(0)
  status        String   @default("ACTIVE")  // ACTIVE | SETTLED | RELEASED
  createdAt     DateTime @default(now())
  settledAt     DateTime?
}
```

`executionId` is unique so an execution can never reserve twice. Holds are the
single source of "money committed but not yet spent"; `available` is never stored.

### Ledger entry kinds

Extend the existing `kind` CHECK with: `BET_DEBIT`, `SELL_CREDIT`, `PAYOUT`,
`FEE_DEBIT`, `WITHDRAWAL`, `REVERSAL`. Keep the `(refType, refId, kind)` unique index
— it is what makes every one of these idempotent.

---

## 5. Flows

### 5.1 Placing a bet

In one transaction, before the order is submitted:

1. Lock the wallet's balance row (`SELECT … FOR UPDATE`) — a count-then-insert on
   `available` races exactly like the voting budget did.
2. Compute `available`. If it does not cover the quote's notional plus worst-case
   fee, reject with `INSUFFICIENT_FUNDS` **before** creating the execution.
3. Create the `Execution` and the `FundsHold` together.

Only then submit to the venue. A crash after the hold but before submission leaves a
stale `ACTIVE` hold, swept by the recovery step that already exists for stuck
executions.

Rejecting before the execution row exists matters: a user must never see a failed
order they could not have afforded.

### 5.2 Fill recorded — the critical seam

`applyExecutionResult` in `src/server/betting/repository.ts:364` already takes a
`FOR UPDATE` lock on the position and applies unseen fills inside one transaction.
**Cash movement must happen in that same transaction.** If it happens after, a crash
in between produces a position nobody paid for, which is the exact failure the
fill-driven ledger was built to prevent.

Per newly recorded fill:

- `BET_DEBIT` of the fill's notional + fee, referenced by `Fill.id`.
- Increase `hold.spentMicros` by the same amount.

The `(refType, refId, kind)` index means replaying a fill cannot debit twice.

### 5.3 Partial fills and rejects

When the execution reaches a terminal state:

- Spent is what actually filled; `amountMicros - spentMicros` is released.
- Mark the hold `SETTLED` (some fill) or `RELEASED` (none).
- Released funds become available immediately.

Rounding dust from fee calculation goes to the house, and must be recorded as an
explicit entry rather than left as a discrepancy — otherwise `auditBalances` starts
reporting noise and people learn to ignore it.

### 5.4 Change Your Mind

A downward adjustment sells shares back. Proceeds are a `SELL_CREDIT` referenced by
the `Fill.id` of the sell, applied in the same transaction as the fill — identical
discipline to 5.2. An upward adjustment is a new buy and takes a new hold.

### 5.5 Resolution

Once a market resolves and scoring completes:

- Winning positions: `PAYOUT` of `shares × $1`, referenced by `Position.id`.
- Pool trades: `FEE_DEBIT` of the configured share of profit, referenced by `Position.id`.
- Losing positions: nothing — the money left at fill time.

Referencing `Position.id` makes payout idempotent per position, the same way
`PredictionScore` is idempotent per prediction. Reuse reputation's `pnlMicros`
rather than recomputing profit, or the two will drift.

### 5.6 Withdrawals

The hard one, because today the server holds **no treasury key** — which is what
makes "user deposits cannot be spent by the execution path" a structural fact rather
than a promise. Any automated withdrawal reverses that.

**v1: operator-processed queue.**

1. User requests a withdrawal → debit `WITHDRAWAL` and hold the funds immediately, so
   the same balance cannot be withdrawn twice or bet while queued.
2. Request enters a `PENDING` queue.
3. An operator reviews and sends the transfer **from a wallet the server does not
   control**.
4. Operator marks it complete with the txHash; a failure reverses the debit with a
   `REVERSAL` entry.

Slower and manual, but the server never holds a spending key, and volume will be low
enough at launch that a human in the loop is a feature. Automate later behind
per-day caps and a hot/cold split, once volumes justify the risk.

### 5.7 Deposit watcher

Poll the treasury address for incoming transfers, wait N confirmations, then call the
crediting endpoint that already exists (idempotent per `(chainId, txHash, logIndex)`,
so replays are safe).

Reorg handling: credit only after N confirmations, and keep a `REVERSAL` path for a
credit whose transaction later disappears. Rare, but without it the invariant can
silently break.

---

## 6. Reconciliation

The invariant has to be checked by a job, not by hope. Extend the existing
read-only inventory reconciliation to compare:

| Internal | Against |
|---|---|
| Σ user balances + Σ active holds | Treasury USDC + omnibus USDC |
| Σ open position shares | Venue share balances |
| Σ ledger entries per wallet | That wallet's stored balance (`auditBalances`) |

Report, never auto-correct — the same rule the existing reconciliation follows. Any
shortfall is an operational incident: stop accepting orders, investigate, then adjust
with an explicit `ADJUSTMENT` entry that names a human.

Note that pool fills are currently `isSimulated: true` and reconciliation
deliberately scopes to non-simulated fills. Real-money pools flip that, and the
scoping must be revisited or pool fills will be silently excluded from solvency.

---

## 7. Failure modes and what covers each

| Failure | Covered by |
|---|---|
| Same balance backs two bets | Hold created under a `FOR UPDATE` lock on the balance row |
| Crash between hold and submit | Stale `ACTIVE` hold swept by the existing recovery step |
| Position exists that nobody paid for | Debit is in the **same transaction** as the fill |
| Fill replayed by a retrying worker | `(refType, refId, kind)` unique on `Fill.id` |
| Partial fill leaves funds stranded | Terminal-state settle releases `amount - spent` |
| Double payout at resolution | Entry referenced by `Position.id` |
| Deposit credited twice | `(chainId, txHash, logIndex)` unique |
| Deposit reorged after credit | N confirmations + `REVERSAL` path |
| Withdrawal double-spend | Debit and hold at request time, single-flight claim |
| Balance goes negative | CHECK constraint on `treasury_balances` (exists) |
| Silent drift | Solvency job (§6) |

Each row needs a test that fails when the protection is removed — the standard the
rest of this codebase is held to.

---

## 8. Order of work

1. **USDC deposits and buying power** — add the asset, expose `available`. Small.
2. **Holds + debit on fill** — the core. Touches `applyExecutionResult`, which is the
   most safety-critical function in the codebase. Expect this to be the slowest phase
   and the one that needs the most adversarial testing.
3. **Payouts and fees at resolution** — moderate; mirrors existing scoring idempotency.
4. **Solvency reconciliation + alerting** — must land before any real money, not after.
5. **Withdrawals (manual queue)** — includes an operator UI or at minimum a documented
   runbook.
6. **Deposit watcher** — can be manual/operator-driven at first.
7. **Live test with tiny caps** — the entire live Polymarket path has still only run
   against scripted venues. `VEYRA_MAX_STAKE_USD` low, one real order, reconcile.

Phases 1–4 are the ones that must be complete and adversarially tested before a
single real dollar. 5 and 6 can start manual.

---

## 9. Before flipping to live

- [ ] Solvency job green for a sustained period on paper volume
- [ ] Every failure mode in §7 has a test that fails when the protection is removed
- [ ] `INSUFFICIENT_FUNDS` is surfaced properly in the UI, before an order is created
- [ ] Withdrawal runbook written and rehearsed on testnet
- [ ] The LAUNCH.md small live test passed against the real venue
- [ ] Reconciliation baseline recorded before the first live order
- [ ] Operator-resolution and proposer-conflict risks (§10) have a decided policy
- [ ] Regulatory position answered

---

## 10. Open decisions — these are not mine to make

1. **Withdrawal model.** Manual queue (recommended) or automated hot wallet. The
   second needs a key-management design, per-day caps, and monitoring.
2. **Tokenized assets: custody only, or collateral?** Collateral means an oracle and
   a liquidation engine. Recommendation is custody-only for v1.
3. **Pool resolution authority.** Operator-decided is a real trust burden once money
   is real. Consider a dispute window before payouts finalise.
4. **Proposer conflict of interest.** A proposer can vote their own question up and
   trade against house capital. At minimum, disclose the proposer and bar them from
   trading their own pool while Veyra is the counterparty.
5. **Jurisdiction and licensing** for holding user funds and taking the other side of
   user trades. This can invalidate the plan regardless of code quality, so answer it
   before phase 2, not after phase 7.

---

## 11. Honest sizing

Phase 2 alone is comparable in scope to the entire pool AMM, because it modifies the
function every position in the system depends on, and it has to be right under
partial fills, rejects, retries, concurrent workers and crashes.

The spec is the easy part. The reason to run paper first is that it lets you observe
real pricing and real user behaviour while this gets built properly, rather than
under launch pressure.

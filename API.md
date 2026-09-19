# Veyra API guide

Everything the frontend needs, in the order you'd build it. Written for someone who
has not seen the backend.

Companion docs: `README.md` (run it locally), `LAUNCH.md` (deploy), `AUDIT.md` (what
each subsystem guarantees and what it deliberately does not).

---

## 1. Conventions

**Base URL** — same origin. All routes live under `/api`.

**Money is a string, never a number.** USD amounts (`"25.00"`), share counts
(`"6.25"`) and prices (`"0.5100"`) are decimal strings. Some newer endpoints return
raw integers as strings named `...Micros` (6 decimal places, so `"1000000"` = 1.00).
Never `parseFloat` a money value and send it back — round-tripping through a float
loses precision the backend enforces to the micro. Format for display only.

`Bps` means basis points: `5021` = 50.21%. Divide by 100 for a percentage.

**Errors** always look like this, with the HTTP status matching:

```json
{ "error": { "code": "VOTE_LIMIT", "message": "You have used all 3 of your votes for this round." } }
```

Show `message` to users — it is written to be read. Branch on `code`, never on
message text. A non-JSON body (host error page) means the server is down; the
existing client helper in `src/lib/betting-api.ts` already converts that into a
clean `ApiError` rather than an "Unexpected token '<'" crash. Reuse it.

**Auth** comes in three flavours:

| Marked | How |
|---|---|
| public | No auth. |
| **session** | Wallet sign-in cookie (§2). Sent automatically with `credentials: "same-origin"`. |
| **operator** | `Authorization: Bearer $VEYRA_OPERATOR_TOKEN`. Server-side/admin only — never put this token in frontend code. |

Session writes are same-origin checked, so include `credentials: "same-origin"` on
every mutating call.

**Idempotency** — `POST /api/predictions` and `PATCH .../confidence` take an
`idempotency-key` header. Send a UUID; if you retry with the same key you get the
same prediction back instead of a second order. Always send one.

---

## 2. Wallet sign-in

One signature, no gas, no password. Three steps:

```js
// 1. Ask for a nonce and the exact message to sign.
const { nonce, message } = await post("/api/auth/nonce", { walletAddress });

// 2. Have the wallet sign `message` verbatim (do not reformat it).
const signature = await wallet.signMessage(message);

// 3. Exchange it for a session cookie (HttpOnly; you never read it).
await post("/api/auth/verify", { walletAddress, nonce, signature });
```

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/nonce` | public | → `{ nonce, message }`. Single use, short TTL. |
| POST | `/api/auth/verify` | public | → `{ walletAddress }` + sets the cookie. |
| GET | `/api/auth/session` | public | → `{ walletAddress }` or null. Use on load to restore state. |
| POST | `/api/auth/logout` | public | Clears the cookie. |

EVM and Solana wallets are both supported. `WalletProvider` already implements this
and exposes `signingIn`, `signInError` and `hasSession` — prefer wiring to it over
re-implementing.

**On 401**, the session expired: re-run sign-in and retry the request once with the
**same idempotency key**.

---

## 3. Markets and books

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/markets` | public | `{ source, markets[] }` — Polymarket list, falls back to the local catalog. |
| GET | `/api/markets/[id]` | public | One market. Resolves catalog, Veyra pool, then Polymarket. |
| GET | `/api/markets/[id]/book` | public | Live order book for a market/outcome. |
| GET | `/api/trades` | public | Recent trades (display only). |

A market's `source` tells you what you're dealing with, and it changes the UI:

- `"polymarket"` — real venue market, real liquidity, another trader is the counterparty.
- `"veyra"` — a Veyra-native pool created by daily voting. **Veyra is the counterparty** (§6).
- `"local"` / demo — catalog sample data, paper only.

---

## 4. Placing a prediction

The core flow: **quote → place → poll**.

### Quote (public, no commitment)

```
POST /api/predictions/quote
{ "marketId": "...", "outcome": "YES", "confidencePct": 80, "stakeUsd": "25.00" }
```

Returns `{ quote }` where `quote.accepted` tells you whether the engine will trade.
The user states a probability; the engine compares it to the live book, computes the
edge and Kelly-sizes the position — so `stakeUsd` is a **maximum**, not the amount
spent. `quote.position.notionalUsd` is what would actually be deployed.

A rejected quote is normal, not an error: not enough edge, spread too wide, stale
book. `describeQuoteRejection()` in `src/lib/betting.ts` turns it into copy.

### Place (session)

```
POST /api/predictions
Headers: idempotency-key: <uuid>
{ "marketId": "...", "outcome": "YES", "confidencePct": 80, "stakeUsd": "25.00", "idempotencyKey": "<same uuid>" }
```

→ `201 { prediction }`.

**The important part:** `201` means *accepted*, not filled. Execution is asynchronous.
The returned `prediction.position.shares` starts at `"0.00"` and only becomes
non-zero once the venue confirms a real fill. Never show the user a position based on
what they requested — the whole ledger is built on the rule that positions change
only from recorded fills.

Poll `GET /api/predictions/[id]` and render from:

- `prediction.status` — the prediction itself.
- `prediction.execution.status` — `created` → `submitted` → `filled` / `partial` / `failed` / `open` / `unknown`.
- `prediction.position.status` — `pending` → `filled` / `partially_filled` / `failed`.

`StatusChip` already maps every one of these to a label and colour. Use it.

### Reading predictions

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/predictions?marketId=&walletAddress=` | public | `{ predictions[] }` |
| GET | `/api/predictions/[id]` | public | `{ prediction }` |
| GET | `/api/positions?walletAddress=&marketId=` | public | `{ positions[], predictions[] }` |
| GET | `/api/users/[wallet]/predictions` | public | That wallet's predictions. |
| POST | `/api/executions/[id]/sync` | session | Force a venue reconcile (owner only). Good for a "refresh" button. |

`PredictionDTO` carries `position`, `execution`, `marketResolution` and `settlement`
(the Robinhood Chain reference; only `status: "confirmed"` means final).

---

## 5. Change Your Mind

```
PATCH /api/predictions/[id]/confidence
Headers: idempotency-key: <uuid>
{ "confidencePct": 60, "idempotencyKey": "<same uuid>" }
```

→ `{ prediction, history }`.

Moving 80 → 60 sends only the **share delta** to the book, not a new position. The
history row starts `pending` and becomes `applied` once the fill is reconciled — so
again, don't render the new confidence as settled until it is.

`GET /api/predictions/[id]/confidence-history` → `{ history[] }`, each with
`status`, both confidences and the shares moved. This is what the wager page timeline
renders.

---

## 6. Daily voting and Veyra pools

**No UI exists for this yet — it's yours to build.** The backend is complete and
tested.

### How the cycle works

One round runs every 24 hours: `OPEN → CLOSED → FINALIZED`. Users propose questions
and vote; when the round closes the tally is **frozen** (never recomputed) and the
top 5 become Veyra-native pools. A background worker drives every transition, so the
frontend only reads and writes — it never triggers a close.

### Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/voting/round` | public | Current round, proposals, live tally. Read-only. |
| POST | `/api/voting/proposals` | session | `{ title, category?, tag?, resolvesAt? }` → `201 { proposal }` |
| POST | `/api/voting/votes` | session | `{ proposalId }` → `{ recorded, votesUsed, votesRemaining }` |
| GET | `/api/voting/rounds` | public | Past rounds. |
| GET | `/api/voting/rounds/[id]` | public | Frozen results — the audit trail. |

`GET /api/voting/round` returns:

```json
{
  "round": { "id": "...", "status": "OPEN", "closesAt": "2026-09-20T10:00:00.000Z",
             "selectionCount": 5, "votesPerWallet": 3 },
  "proposals": [ { "id": "...", "title": "...", "voteCount": 9, "rank": 1, "category": "crypto", "createdAt": "..." } ],
  "myVotes": ["proposalId"],
  "votesRemaining": 2
}
```

**`round` can be `null`** — briefly, between one round finalizing and the worker
opening the next. Render an empty state, not a crash.

Things to build around:

- A wallet gets **3 votes per round** (`votesPerWallet`), one per proposal. Disable
  cast buttons at `votesRemaining === 0` and mark proposals in `myVotes` as used.
- **Voting twice for the same proposal is a no-op, not an error** — you get `200` with
  `recorded: false`. Safe to retry.
- Over budget returns `429 VOTE_LIMIT`. Closed round returns `409 ROUND_CLOSED`.
- Duplicate title returns `409 DUPLICATE_PROPOSAL` (titles are compared
  case/whitespace-insensitively).
- `rank` is live while OPEN. After close, read the frozen ranking from
  `/api/voting/rounds/[id]` — do not re-sort votes client-side, the stored `rank`
  is the auditable answer and ties are broken by submission time.

### Pools

The winners become markets with `source: "veyra"` and ids like `veyra-<proposalId>`.
They render through the existing contract page.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/pools/[marketId]` | public | How the pool is funded and priced. |

```json
{ "marketId": "veyra-...", "funded": true, "status": "ACTIVE", "feeBps": 200,
  "maxLossMicros": "250000000", "yesPriceBps": 5021, "noPriceBps": 4979,
  "sharesYesMicros": "3000000", "sharesNoMicros": "0" }
```

**What makes pools different, and what the UI must say:**

- **Veyra is the counterparty**, not another trader. The pool prices off an LMSR
  market maker funded by a liquidity fund built from trading fees; whatever is not
  committed to a pool sits in the reserve.
- **Price moves with size.** The quoted price is marginal; buying walks a ladder, so
  a larger order pays more. Always show the quote's `avgPrice`, not the mid.
- **An unfunded pool cannot be traded.** `{ "funded": false, "reason": "AWAITING_LIQUIDITY" }`,
  and quoting returns `409 POOL_NOT_FUNDED`. This is deliberate: a pool with no
  counterparty has no honest price, so it shows none. Render "awaiting liquidity",
  never a fallback price.
- A **2% fee on profit** applies at resolution (`feeBps`).

`PoolLiquidityNote` (`src/components/pools/PoolLiquidityNote.tsx`) already renders
this explanation on the contract page — reuse or restyle it rather than rewriting the
wording, which is deliberately specific about who takes the other side.

---

## 7. Conviction

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/markets/[id]/conviction` | public | Aggregate belief. |
| GET | `/api/markets/[id]/conviction/stream` | public | Server-Sent Events; same payload on change. |

```json
{ "participants": 1, "totalCapitalUsd": "3.12", "averageConfidence": 75,
  "capitalWeightedConfidence": 75, "conviction": 75,
  "polymarketProbability": 0.52, "divergence": 0.23,
  "outcomes": { "YES": {...}, "NO": {...} }, "distribution": [...], "trail": [...] }
```

Only **real filled positions** are counted — never pending or failed ones — so an
active market can legitimately report `participants: 0`. All numbers are computed
server-side and are deterministic; do not derive your own from positions, or your
figure will disagree with everyone else's.

Prefer the SSE stream for live pages; fall back to polling the plain endpoint if the
stream drops (`convictionStale` in `ContractView` shows the pattern).

---

## 8. Reputation

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/users/[wallet]/reputation` | public | `{ reputation }` — Brier, calibration bins, per-category. |

Only **resolved, filled** predictions are scored. A new wallet returns a clean zero
state, which the UI should treat as "no track record yet" rather than "0% accurate".
`ReputationView` already handles this.

---

## 9. Treasury (custody)

**No UI exists yet.** Two wallets are kept structurally separate: the treasury holds
user deposits and the server has no key for it, while a separate execution wallet
trades Polymarket. They are never netted against each other.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/treasury/balances` | session | `{ walletAddress, balances: [{ asset, balanceBase, decimals }] }` |
| GET | `/api/treasury/exposure` | session | Positions backing that wallet's venue exposure. |

`balanceBase` is an integer string in the asset's own base units — divide by
`10 ** decimals` for display, and keep the raw value for any maths. Deposits are
credited by an operator/watcher, not by the user, so there is no deposit endpoint for
the frontend to call.

---

## 10. Operator endpoints

Server-side only. **Never call these from the browser** — the token is an admin
credential.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/operator/readiness` | Every dependency; `503` when not ready. |
| GET/POST | `/api/operator/inventory-reconciliation` | Read-only ledger vs venue report. |
| GET/POST | `/api/operator/liquidity` | Read fund balances / add operator capital. |
| POST | `/api/operator/pools/resolve` | `{ marketId, outcome }` — pools have no oracle, an operator decides. |
| POST | `/api/operator/treasury/deposits` | Credit a confirmed on-chain deposit. |
| GET | `/api/operator/treasury/report` | Wallet separation and balance audit. |
| POST | `/api/markets/[id]/resolve` | Resolve a market. |
| POST | `/api/executions/flush`, `/api/reputation/flush`, `/api/jobs/run` | Kick background work. |
| GET | `/api/health` | Public. Load-balancer probe. |

---

## 11. Local setup for frontend work

```bash
cp .env.example .env          # set DATABASE_URL and DIRECT_URL (PostgreSQL)
npm install
npm run db:migrate
npm run dev                   # http://localhost:3000
```

Two settings make voting testable without waiting a day:

```bash
VEYRA_VOTING_ROUND_MS="60000"   # a 60-second round instead of 24h
VEYRA_WORKER_INTERVAL_MS="15000" # run the worker in-process
```

Without a worker, nothing advances — rounds never close, orders never fill. Either
set the interval above or poke `POST /api/jobs/run` with the operator token.

Pools need liquidity before they quote:

```bash
curl -X POST -H "Authorization: Bearer $VEYRA_OPERATOR_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"amountMicros":"1000000000","reference":"dev-seed"}' \
  http://localhost:3000/api/operator/liquidity
```

---

## 12. Things that will bite you

1. **`201` is not "filled".** Execution is async. Render from `position.status` and
   `execution.status`, never from what was requested.
2. **Always send an idempotency key** on place and confidence changes, and reuse it
   on retry. Without it a retry can create a second order.
3. **Money is strings.** Don't `parseFloat` and send back.
4. **`round` can be null**, and `participants` can be `0` on an active market. Both
   are valid states, not errors.
5. **Unfunded pools show no price.** Handle `POOL_NOT_FUNDED` / `AWAITING_LIQUIDITY`
   explicitly rather than falling back to 50/50.
6. **Don't recompute conviction, ranks or PnL client-side.** The server's numbers are
   the auditable ones; a second implementation will drift.
7. **Pools trade in paper mode today.** Fills are simulated. The flow is real end to
   end, the money is not.
8. **The markets page still shows sample data** (`SAMPLE DATA` badges, placeholder
   leaderboards in `src/components/markets/primitives.tsx`). Those are not wired to
   the backend — don't assume a number on screen came from an API.

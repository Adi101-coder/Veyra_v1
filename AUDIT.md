# Veyra end-to-end audit (2026-09-17)

Branch `audit/end-to-end` (9 commits on top of `main`). Baseline before audit: 73 tests passing, no migrations, no authentication.

## Fixed

### Execution / Polymarket (funds safety)
- **Fabricated live fills.** After posting an order, the live client walked the local order book and recorded those as real (`simulated: false`) fills — "accepted = filled". Live fills now come only from the venue: POST `/order` `makingAmount`/`takingAmount` on `matched`, or authenticated `/data/order/{id}` + `/data/trades` (`src/server/polymarket/live.ts`).
- **Duplicate live orders.** `submitSlice` re-posted any order that came back without fills (resting, delayed, timeout) up to 3×. Retries now happen only for venue-refused (429/425/503) orders, with backoff.
- **Accepted orders marked failed.** Resting/delayed/unknown orders are now `open`/`unknown`; the batch stays `SUBMITTED` and `ExecutionEngine.reconcileBatch` allocates fills exactly once when the venue order is terminal.
- **Wrong order endpoint.** `fetchClobOrder` used unauthenticated `/order/{id}`; replaced with SDK `getOrder` (L2) + `getTrades`. Documented statuses handled (`CANCELED`, `CANCELED_MARKET_RESOLVED`, `INVALID`, `TRADE_STATUS_*`).
- **Positions before execution.** A new position stored the engine's *desired* shares/notional; fills only changed status. Positions now start empty and change only from recorded fills (`src/server/betting/ledger.ts`), deduped by venue trade id (DB unique `executionId+venueTradeId`).
- **Non-atomic intent claims** (find → update → find) could double-execute across processes. Now a single UPDATE with a claim token.
- **Lost intents.** `enqueueAndProcess` could return an in-flight run that excluded the new intent → execution marked failed while the intent later executed. Fixed.
- **Worker crash left intents PROCESSING forever** (execution `created`, position `pending`, nothing retried or reported). Intents now carry `claimedAt`; the worker's `recover` step hands expired claims whose batch reached `SUBMITTED` to reconciliation and fails the rest (nothing was sent).
- **Null venue trade ids bypassed fill dedupe** (SQLite treats NULLs as distinct). `Fill.venueTradeId` is now required in schema and types.
- **Stale quotes requeued forever** (and could execute later at an unseen price). Stale intents now fail and every owner's execution is updated.
- **Synthetic book used for real tokens** when a live book had no asks. Real tokens never fall back; synthetic (demo) books are paper-only and rejected in live mode. Demo tokens now resolve their paper book inside the engine (found by the HTTP smoke test).
- Duplicate live submitters removed; single `PolymarketClient`. Signature types 0–3 + funder address configurable. Taker fees derived from `fee_rate_bps`.

### Change Your Mind
- Adjustments re-read the position under the lock; pending venue orders keep the position `adjusting` and history `pending` until reconciled, then history/confidence settle from actual fills.
- Adjusting to 0%/100% was allowed although placement enforces 1–99%. Now rejected.
- Adjustments blocked on resolved/closed markets; closed (0-share) positions can re-enter.

### Auth / API / security
- **No authentication.** Added wallet sign-in (EVM `personal_sign`, Solana ed25519) with single-use DB nonces and an HMAC HttpOnly session cookie. Writes act only for the session wallet; body wallet mismatch → 403. Same-origin check on writes (CSRF).
- **Anyone could resolve markets / flush jobs.** Resolve, flush, batch detail and `/api/jobs/run` require `VEYRA_OPERATOR_TOKEN`.
- Idempotency-Key required on money-moving writes; concurrent same-key requests return one prediction (P2002-safe).
- Rate limits (in-process) on quote, place, adjust, sync, sign-in. 500s no longer leak internal error text. EVM addresses canonicalized to lowercase.

### Resolution / reputation
- Polymarket markets resolve only to Gamma's final state (`closed && umaResolutionStatus == resolved`, winner priced "1"); a mismatching operator outcome → 409. `INVALID` outcome closes without scoring. Resolution sync worker added.
- Market is closed in the same transaction as the job; catalog upserts can no longer reopen a resolved market; new bets/quotes/adjustments on resolved markets → 409.
- Only predictions with fills, created before the cutoff, are scored — all of them (was capped at newest 100). PnL = winning held shares + sell proceeds − filled cost.
- Failed jobs re-queue, stale PROCESSING leases are reclaimed, conflicting outcomes rejected, concurrent scoring (P2002) tolerated, `recordOpen` transactional and only after a fill. Removed full-table wallet scans.

### Conviction / realtime
- Counts only positions holding filled shares, capital = filled cost basis (was requested stake, including failed orders). Hedged wallets keep YES and NO capital on their own sides.
- Polymarket probability from CLOB midpoint (bps) instead of 1%-rounded Gamma price.
- SSE stream: no interval leaks (404 path, early abort, cancel), non-overlapping ticks, one shared computation per market per interval.

### Database
- Baseline migration (`prisma/migrations/…_init`) with CHECK constraints (confidence range, positive stake/fill, non-negative position, valid statuses/sides), FKs from intents/history to executions, fill uniqueness, auth nonce table, job lease column. `npm run db:migrate` = `prisma migrate deploy`.

### Frontend (no redesign)
- Sign-in on first 401 with transparent retry using the same idempotency key.
- Stable idempotency key per user intent + in-flight guards (double-click safe); a quote must match current inputs.
- Demo catalog never labelled live (dashboard, hero, contract); "Demo market · paper only" labels; sample-data badges on the static /markets sections.
- Removed invented data: fake creator/wager addresses and dates, SOL stakes/table options, invented wager counts, fake live esports score; risk meters now show backend USD cost/payout.
- Wager rows: failed ≠ resolved; RESOLVED/LANDED/MISSED from market resolution. Execution status polls/syncs while pending. Error states distinct from empty states. Conviction stream ignores older events, closes on 404, dims on error. Broken "Watch this wager" link fixed. Write page no longer claims to publish.

## Tests
- **111 tests in 16 files, all passing** (baseline 73). One existing test that asserted the unsafe blind-retry behaviour was rewritten.
- New: Prisma end-to-end on a freshly migrated SQLite DB (resting order → reconcile fill once → duplicate/concurrent submit → 80→60 fill → rejected 60→90 → cross-wallet 403 → failed order excluded from conviction/reputation → resolution refused before Gamma / mismatch → scored once, Brier 0.16 → late bet/adjust 409); venue response mapping (full/partial/SELL/resting/unknown, trades, CANCELED, fees); Gamma resolution; sessions, CSRF, operator token, Solana + EVM signature verification; ledger; Brier reference values (90%/50% correct/incorrect, NO picks) and PnL; confidence boundaries (0/1/50/99/100%, $1/$100k stake); 90→90, 90→10, 0%/100% adjustments; stale-quote and timeout never re-posted; crashed-worker intent recovery. `prisma migrate diff` confirms the migration matches the schema exactly.
- **Fresh DB + running app:** deleted DB → `prisma migrate deploy` → `next build` → `next start`; HTTP smoke test over the real API: unauthenticated 401, bad signature 401, nonce replay 401, missing key 400, other-wallet 403, CSRF 403, concurrent duplicate → one prediction, paper fill, 80→60 SELL filled, 100% rejected, operator gating 403, resolve 202, conflict 409, worker runs twice idempotently, reputation Brier 0.16, late bet 409.
- **Browser:** dashboard (live Polymarket feed), contract page (demo label, backend quote, wager row, resolved state), wager page (confidence history, resolution, owner-only controls), no console errors.
- Not verified in browser: an actual wallet extension signing, and mobile width (window resize did not apply; added markup was checked in code — responsive `sm:` grids, no fixed widths). ESLint: 6 pre-existing rule violations remain (Community, Docs, Navbar, and the original wallet-activity effect in WalletProvider — a file this audit also edited, but not that effect).

## External integrations verified (official docs + SDK + live calls, 2026-09-17)
- Polymarket CLOB: `/book` (live ordering bids asc / asks desc — engine sorts), `/price`, `/midpoint`, `/data/order/{id}` and `/data/trades` (L2), POST `/order` response fields/statuses, tick sizes, market order amount semantics (BUY USDC / SELL shares), signature types 0–3, chain 137/80002, taker fees. `@polymarket/clob-client-v2` 1.1.0 exports and viem `WalletClient` signer confirmed.
- Gamma: `/markets/slug/{slug}` for closed markets, resolution fields.
- Robinhood Chain: **not used anywhere in this repo** (wallets are EVM MetaMask/Binance + Solana; no chain config). Official values for reference: mainnet 4663 `https://rpc.mainnet.chain.robinhood.com`, testnet 46630. Nothing added.

## Remaining / needs real credentials or production
- Live order placement, `makingAmount`/`takingAmount` per-side meaning in responses, trade status prefix format, and `fee_rate_bps` units are documented-but-unconfirmed; they need a funded Polymarket account and a small live test.
- Live orders whose submission outcome is `unknown` **without** an order id (network timeout) stay `SUBMITTED` with `RECONCILE_REQUIRED` for operator review — there is no automatic search of open orders/trades for them.
- `GET /api/predictions` (contract page wager table) still returns at most 100 rows per market; scoring uses an uncapped query, so this is display-only truncation.
- Resting GTC orders are reconciled but never cancelled automatically (default order type is FAK).
- Rate limiter and conviction cache are per-process; multi-instance deployments need a shared store. SQLite is single-writer.
- Real wallet-extension sign-in (MetaMask/Phantom) not exercised in a browser; smart-contract (ERC-1271) wallets are not supported by the EVM verifier.
- Paper mode fills against real or demo books are simulated (flagged `mode: paper`, `isSimulated`) — do not run production in paper mode.

## Production risks
- **Incorrect positions / duplicate execution:** venue responses that differ from the documented shapes could leave orders `open`/`unknown` (safe, but requires reconciliation) — verify with real credentials first. Timeouts without an order id need manual reconciliation.
- **Omnibus inventory:** all users trade through one server wallet; internal crossing of opposing intents assumes that wallet actually holds the netted shares. There is no on-chain balance reconciliation job.
- **Incorrect settlement:** resolution relies on Gamma `umaResolutionStatus`; disputed/re-resolved markets after a job runs are not re-scored.
- **Fees:** fee accounting depends on `fee_rate_bps` from trades; unconfirmed units could misstate PnL/ROI (not positions).
- Not production-ready until the live Polymarket path is exercised with real funds in a controlled test.

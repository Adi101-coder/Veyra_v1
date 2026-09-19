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
- **Null venue trade ids bypassed fill dedupe** (NULLs compare as distinct in a unique index). `Fill.venueTradeId` is now required in schema and types.
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
- **Robinhood Chain** — checked against https://docs.robinhood.com/chain/connecting and live JSON-RPC calls on 2026-09-17:
  - Official values: mainnet chain ID 4663, public RPC `https://rpc.mainnet.chain.robinhood.com` (rate-limited, docs say not for production; use Alchemy/other providers), WebSocket via provider (`wss://robinhood-mainnet.g.alchemy.com/v2/{KEY}`), sequencer feed `wss://feed.mainnet.chain.robinhood.com` (not a JSON-RPC socket), explorer robinhoodchain.blockscout.com, gas token ETH. Testnet 46630, `https://rpc.testnet.chain.robinhood.com`, explorer explorer.testnet.chain.robinhood.com.
  - Live: `eth_chainId` returned `0x1237` (4663) on mainnet and `0xb626` (46630) on testnet; both return advancing block numbers.
  - Repo audit, item by item: chain ID, RPC and WebSocket config, network config, chain switching (`wallet_switchEthereumChain`) and testnet/mainnet selection — **none exist** (no reference to Robinhood Chain anywhere in the code, env or docs). Wallet handling: EVM wallets (MetaMask/Binance) are only used for sign-in via chain-agnostic `personal_sign`; addresses are validated as 20-byte hex and lowercased. Transactions and gas: Veyra sends **no** on-chain transactions from the browser; the only signing wallet is the server's Polymarket key on Polygon (137). Wallet activity reads Ethereum mainnet (Blockscout/Etherscan) and Solana, not Robinhood Chain.
  - Result: nothing to correct. Following the "no unnecessary contracts/on-chain logic" rule, no Robinhood Chain integration was added; if one is introduced, use the values above with a provider RPC and keep mainnet/testnet in separate env vars.

## Remaining / needs real credentials or production
- Live order placement, `makingAmount`/`takingAmount` per-side meaning in responses, trade status prefix format, and `fee_rate_bps` units are documented-but-unconfirmed; they need a funded Polymarket account and a small live test.
- Live orders whose submission outcome is `unknown` **without** an order id (network timeout) stay `SUBMITTED` with `RECONCILE_REQUIRED` for operator review — there is no automatic search of open orders/trades for them.
- `GET /api/predictions` (contract page wager table) still returns at most 100 rows per market; scoring uses an uncapped query, so this is display-only truncation.
- Resting GTC orders are reconciled but never cancelled automatically (default order type is FAK).
- Rate limiter and conviction cache are per-process; multi-instance deployments (including serverless) need a shared store for those two.
- Real wallet-extension sign-in (MetaMask/Phantom) not exercised in a browser; smart-contract (ERC-1271) wallets are not supported by the EVM verifier.
- Paper mode fills against real or demo books are simulated (flagged `mode: paper`, `isSimulated`) — do not run production in paper mode.

## Production risks
- **Incorrect positions / duplicate execution:** venue responses that differ from the documented shapes could leave orders `open`/`unknown` (safe, but requires reconciliation) — verify with real credentials first. Timeouts without an order id need manual reconciliation.
- **Omnibus inventory:** all users trade through one server wallet; internal crossing of opposing intents assumes that wallet actually holds the netted shares. There is no on-chain balance reconciliation job.
- **Incorrect settlement:** resolution relies on Gamma `umaResolutionStatus`; disputed/re-resolved markets after a job runs are not re-scored.
- **Fees:** fee accounting depends on `fee_rate_bps` from trades; unconfirmed units could misstate PnL/ROI (not positions).
- Not production-ready until the live Polymarket path is exercised with real funds in a controlled test.

## Robinhood Chain integration (follow-up, 2026-09-17)

**Scope decision — no contract.** Veyra positions are Polymarket CLOB shares on Polygon, and predictions, confidence history, reputation and conviction are off-chain by design, so the architecture does not need an on-chain registry. Settlement references are zero-value self-transactions from a server signer whose input is the ABI-encoded settlement summary (`veyra.settlement.v1`: prediction id, market, wallet, outcomes, confidence, correct, filled cost, PnL, Brier, resolvedAt). The payload hash is stored and re-derivable from the explorer.

**Added**
- `src/lib/robinhood-chain.ts`: typed testnet (46630, default) and mainnet (4663) built on viem's `robinhoodTestnet`/`robinhood` (verified against the docs). Mainnet needs `RH_NETWORK=mainnet` + `RH_ENABLE_MAINNET=true` + `RH_RPC_URL`.
- `src/server/chain/config.ts`, `client.ts`: env-only config (`RH_TESTNET_RPC_URL`, `RH_RPC_URL`, `RH_SETTLEMENT_PRIVATE_KEY`, …) that never echoes keys or RPC URLs. RPC client with chain-id guard, balance, contract reads, EIP-1559 local signing (fee cap, gas headroom, balance check), idempotent raw broadcast, single-poll receipts with confirmations, and error classification. viem's block-number cache is disabled so confirmation counts are current.
- `src/lib/wallet-network.ts` + `WalletProvider`/`ConnectWalletButton`: `eth_chainId` detection, `chainChanged`, and "Switch to Robinhood Chain" (falls back to `wallet_addEthereumChain` with the official public params on 4902; user rejection and pending-request errors are surfaced). Betting does not require the wallet to be on Robinhood Chain.
- `ChainSettlement` table + migration: unique per prediction/chain/kind; CHECKs restrict chain/network pairs and statuses, and require a receipt block for `confirmed`/`reverted` and tx bytes for `signed`/`submitted`.
- `src/server/chain/settlement.ts` + worker `settlement` step: scored predictions → queued → signed (raw bytes persisted **before** broadcast) → submitted → confirmed only from a mined receipt. Also: retry with backoff, then failed; stale `signing` lease reclaim; rebroadcast of the same bytes; dropped-nonce detection → re-sign; wrong-chain RPC never signs. Within one process, no new nonce is signed while unbroadcast bytes exist; a race across processes is not prevented — it is caught as a dropped transaction and re-signed, never sent twice.
- `GET /api/chain/status` (public: network, RPC chain match, head block, signer address/balance). Prediction DTOs carry `settlement`, and the wager page shows "Settling / Settled · tx".

**Tests** (139 passing + 2 opt-in live): chain config and gating; wallet switch/add/reject/pending/stubborn wallet; RPC client against a simulated JSON-RPC node that verifies signatures, chain id and nonces; settlement lifecycle on a migrated DB (happy path with payload decode, crash between sign and broadcast, backoff to failed, wrong chain, revert, confirmation threshold, dropped nonce, disabled, DB rejects receipt-less confirmation); full e2e extended to a confirmed settlement receipt. Live (opt-in `RH_LIVE_RPC_TEST=1`, run and passing): testnet 46630 and mainnet 4663 RPCs, balance read, receipt-not-found. A signed tx from an unfunded throwaway key was rejected by the real testnet and classified `insufficient_funds`.

**Running app (real testnet RPC, unfunded throwaway key):** `/api/chain/status` reports chain 46630 at the live head. The full HTTP flow (sign-in → bet → paper fill → 80→60 → resolve → score) created a settlement reference that correctly stayed `queued/insufficient_funds` with no transaction sent; the wager page shows "Settling".

**Found and fixed during verification:** confirmation counts used stale cached block numbers.

**Merge risk — amended migration:** `prisma/migrations/…_init/migration.sql` was edited in place (adding `claimedAt` and making `Fill.venueTradeId` NOT NULL) after it had already been applied locally. With the old local DB, the worker's `recover` step failed ("column `execution_intents.claimedAt` does not exist"). Any database created from an earlier commit of this branch has a checksum mismatch and must be dropped and recreated; `migrate deploy` will not repair it. This branch has never been deployed, so no shared environment is affected, and `main` had no migrations.

**Still needs real funds:** an actual confirmed testnet settlement (fund the signer with testnet ETH and set `RH_SETTLEMENT_ENABLED=true`); wallet-extension switching in a real browser wallet; mainnet. Reorgs deeper than `RH_CONFIRMATIONS` are not re-checked after confirmation. Settlement signing assumes one active signer process (a second concurrent process could race a nonce; that is detected as a drop and re-signed, not duplicated).

## Smart Execution hardening (follow-up, 2026-09-17)

**Fixed**
- **Wrong-side fill allocation (funds):** when non-crossing BUY and SELL intents shared a batch, venue fills for the net side were pro-rated across all leftovers, so a SELL could be credited with BUY fills. Venue fills now go only to intents on the side actually sent.
- **Dropped shares:** surplus from USDC-denominated market BUYs filled at a better price, and pro-rata rounding dust, were never allocated (untracked custody inventory). Every venue share is now allocated.
- **Slice cap bypass:** single-level books sent one order larger than `VEYRA_EXECUTION_MAX_SLICE_SHARES`. The cap now always applies.
- **Stale quotes checked for one intent only:** now checked per intent; stale intents fail (never requeue) while fresh ones execute.
- **Missing limits:** aggregated limit capped at touch ± `VEYRA_MAX_SLIPPAGE_BPS`; no order into a spread wider than `VEYRA_EXECUTION_MAX_SPREAD_BPS`.
- **Crash between send and record:** slices are persisted as `unknown` before the venue call. Thrown/timed-out calls (`VEYRA_VENUE_TIMEOUT_MS`) are `unknown`, never retried. Order posts are paced (`POLYMARKET_ORDER_SPACING_MS`).
- **Unknown orders without an id** were stuck forever. After `VEYRA_UNKNOWN_ORDER_GRACE_MS` they close unfilled only if Polymarket shows no open order and no unattributed trade for the token; otherwise they stay open for review.
- **Double allocation across workers:** batch reconcile lease (`reconcileToken`, migration `…_execution_reconcile_lease`), held and heartbeat-renewed by the sending run for the whole venue call. Reconciliation skips batches with intents still `PROCESSING`; crash recovery skips live runs.
- **Concurrent enqueue** of the same execution threw P2002; it now returns the existing intent.

**Tests:** engine failure cases and a multi-worker suite on migrated SQLite. The multi-worker suite checks that separate engines draining one token send each intent exactly once, same-key enqueues collapse to one intent, concurrent reconcilers count fills once, and recovery leaves live runs alone. Six consecutive runs had no flakes. The lease-heartbeat test was mutation-checked (fails with the heartbeat disabled). Full suite: 159 passed, 2 opt-in live tests skipped.

**Running app (fresh DB, all migrations):** build succeeds; HTTP flow unchanged; execution batches `RECONCILED` with leases released and slices recorded → `filled`; all worker steps healthy.

**Remaining:** live timeouts, pacing and orphan-activity lookup need a funded Polymarket account. The orphan check is deliberately conservative (any unattributed activity on the token blocks auto-close). Aggregation uses the strictest limit in a batch, so looser-limit intents may under-fill. Staleness compares against the best ask for both sides, matching how quotes are recorded today.

## Change Your Mind hardening (follow-up, 2026-09-17)

**Fixed**
- **Positions written from caller-computed totals:** `reconcileAdjustment` took absolute position values computed in the request. It now applies only the recorded fills through the position ledger inside the transaction (deduped by venue trade id). It is idempotent, and confidence moves to the new value only when the adjustment execution is `filled` (or a no-op). Desired target values are stored on the history row for audit only.
- **Lock could be taken from any status and release could clobber:** the lock is now taken only from `filled`/`partial`/`closed`. Release only undoes its own `adjusting`, never a status another writer settled.
- **Idempotency key reuse with a different confidence silently replayed:** now returns 409 `IDEMPOTENCY_KEY_REUSED`. Same-key races replay the winner.
- **Concurrent fill writers (worker + user sync)** failed on the unique fill constraint. Both fill-writing transactions now retry on unique/busy conflicts and re-read the recorded fills.
- **Crashed requests left positions `adjusting` forever:** the worker's `recover` step releases locks with no history. It fails adjustments that were never queued (nothing sent), leaves in-flight intents to execution recovery/reconcile, and settles terminal intents from their recorded executed totals.
- **Scoring could use a confidence set after resolution:** reputation now scores the confidence from the latest filled/no-op change requested at or before the resolution cutoff. This is covered by a unit test; the integration scenario cannot reach it because post-resolution changes are already rejected.
- **Recovery could double-count shares:** a recovered aggregate fill (`intent:<id>`) could not dedupe against the venue's real trade ids if recovery raced a worker or user sync. The two are now mutually exclusive per execution inside the transaction; the test covers both orders.

**Tests:** Prisma suite with an invariant check after every scenario (position shares = BUY fills − SELL fills; confidence = last settled value). Scenarios covered:
- rapid 80→60→40 changes
- five concurrent adjustments (exactly one executes, one venue order)
- concurrent same-key requests
- partial fills
- resting adjustments reconciled by two workers plus a user sync racing (fills recorded once)
- rejected adjustments
- adjusting while the opening order is still pending
- the market resolving while an adjustment rests (venue cancel → failed, scored at 80%, later changes 409)
- crash after taking the lock, and crash after writing history but before queueing
- recovery racing a real reconcile, in both orders

The ledger assertion is unclamped (SELL fills exceeding BUY fills fail). Mutation-checked: letting partial fills move confidence, a non-exclusive lock, and removing the recovered/venue fill exclusion are each caught. Five consecutive runs had no flakes. Full suite: 170 passed, 2 opt-in live skipped.

**Remaining:** a pre-cutoff adjustment still pending when the reputation job runs is scored at the prior confidence (scores are not recomputed). Adjustments are one at a time per position by design (concurrent requests get 409 `CONCURRENT_UPDATE`; the UI shows the message).

## Prediction reputation hardening (follow-up, 2026-09-17)

**Verified correct (now covered by tests)**
- Brier for YES and NO picks: 90% correct 0.01, 90% incorrect 0.81, NO@60% on a YES market 0.36, NO@60% on a NO market 0.16. The wallet mean, accuracy, average confidence, calibration bins and ECE are exact.
- Clean empty state for zero-fill and never-trading wallets: counts are 0, metrics `null`, bins and categories empty.
- Scores and all aggregate increments are written in one transaction with a unique `predictionId`.

**Fixed**
- **PnL ignored trading fees:** cost is now filled notional + fees; sell proceeds are notional − fees.
- **Payout used the live position:** held shares, cost and proceeds are now derived only from fills on executions created at or before the resolution cutoff. Later executions, late bets and late confidence rows cannot change a score.
- **Scoring ran over unreconciled orders:** a pre-cutoff opening order still resting made its prediction look zero-fill (skipped forever), or scored with incomplete fills. Jobs now defer, via `availableAt`, while pre-cutoff executions are pending, bounded to 24h. After the bound, still-unfilled orders are not scored.
- **Failed jobs were never retried:** resolution sync ignores resolved markets. Jobs now retry with exponential backoff (`attempts`, migration `…_reputation_job_retry`), become `FAILED` after the max attempts, and a re-enqueue resets them.
- **Late-filling predictions never counted as opened:** `recordOpen` now runs whenever recorded fills give a position shares (placement, reconcile, flush, sync). It is idempotent per prediction.

**Tests:** Prisma reputation suite. Every scenario recomputes wallet aggregates from `PredictionScore` rows. Scenarios:
- exact Brier/accuracy/calibration for YES and NO
- zero-fill and empty states
- partial fill + sell + fees → exact PnL
- cutoff tampering: a post-cutoff history row, confidence overwrite, a post-cutoff execution and a late bet are all ignored; later changes get 409
- deferral until a resting order reconciles, then scoring the real fills
- the defer bound
- INVALID and unresolved markets
- concurrent enqueue and three concurrent workers plus a forced second pass (one score each)
- a mid-job database failure followed by a crashed claim (resumes, no double count)
- max attempts then a clean re-enqueue

Mutation-checked: ignoring fees, dropping the execution cutoff, disabling deferral and removing late-open recording are each caught. Four consecutive runs had no flakes. Full suite: 180 passed, 2 opt-in live skipped.

**Also fixed after review:** the job store's claim now uses the engine's clock, so lease and availability checks agree and timing tests are deterministic. A pass never re-claims a job it just deferred or retried. Negative held shares or proceeds now fail the job loudly instead of being clamped to zero.

**Migration risk:** `…_reputation_job_retry` is the first SQLite table-rebuild migration. It was safe because `reputation_jobs` has no CHECK constraints (verified: Prediction 3, Position 3, Execution 2, Fill 3 and chain_settlements 4 CHECKs survive a fresh `migrate deploy`). The money CHECK constraints on `Prediction`, `Position`, `Execution` and `Fill` exist only in migration SQL, not in `schema.prisma`. Any future change that makes Prisma rebuild one of those tables will silently drop them unless the generated SQL is edited to re-add them.

**Remaining:** `totalPredictions` counts opened (filled) predictions, including those on markets later voided or still open. Scoring metrics (accuracy, Brier, calibration, ROI) use only resolved, scored predictions. Scores are final once written; a disputed Polymarket re-resolution is not re-scored.

## Veyra Conviction hardening (follow-up, 2026-09-17)

**Methodology v2** (`src/server/conviction/formula.ts`, served verbatim in `methodology.definitions`):
- **Inputs:** only positions currently holding filled shares (`sharesMicros > 0`, cost basis > 0, status not pending/failed), filtered in the query and again in the formula. Pending, failed, zero-fill and fully sold positions never count.
- **Capital:** the ledger-maintained cost basis of held shares (from recorded fills), exposed as `totalCapitalUsd` / `capitalMicros`.
- **Side entries:** rows collapse per (wallet, side), with capital summed and confidence capital-weighted. A wallet holding YES and NO keeps each side's capital on its own side and counts once in `participants`.
- **Headline numbers:** `averageConfidence` weights each wallet equally (its implied P(YES) is capital-weighted across its sides); `capitalWeightedConfidence` = Σ(implied × capital) / Σ capital; `conviction` = configured blend; `divergence` = conviction − Polymarket YES.
- **Integer math:** all math is integer (bps/micros, round half up). Outputs are identical regardless of input order or address case. `inputsHash` (sha256 of the sorted inputs and reference price) makes each value auditable.
- **Polymarket reference:** the CLOB YES midpoint only (`polymarketSource: "clob_midpoint"`). After resolution it is the resolved YES price (`"resolved"`). Otherwise `null` (`"unavailable"`), including demo catalog markets, which previously showed a static catalog number or a 1%-rounded Gamma price.

**Fixed**
- The capital definition was undocumented, and the doc text still described the old "latest wins / stake fallback" behaviour. The methodology text now matches the code.
- Snapshot persistence was check-then-insert. A unique (market, time bucket) key (migration `…_conviction_snapshot_bucket`) now keeps concurrent measurements to one snapshot per bucket. Empty markets write no snapshots.
- Realtime ordering used `snapshotAt`, which is null on non-persisting ticks. Every response now carries `asOf`; the contract view orders by it.
- `polymarketProbability` is now nullable; `FeaturedMarket` shows "—" instead of `0%` when unavailable.

**Tests:**
- Unit tests with hand-computed reference numbers: exact headline values, hedger side capital, partial-fill weighting, merging multiple predictions, exclusion of pending/failed/zero rows, empty market, missing midpoint, determinism and hash, and integer rounding.
- Engine tests: resolved/INVALID reference and one snapshot per bucket under concurrency.
- Prisma tests where every result is also recomputed from the `Fill` table: empty market; pending, failed and flattened positions excluded with exact partial capital; a hedger; concurrent reconciliation plus a confidence change while measuring (every concurrent read is a valid state, the settled value matches fills, one snapshot); and after resolution (stable `inputsHash`).
- Mutation-checked: collapsing a hedger across sides, removing the formula eligibility filter, and removing both store and formula filters are each caught.
- Fresh DB + running app: build succeeds; REST and SSE conviction are correct for the smoke flow (a flattened position gives 0 participants; resolved reference 100%). Full suite: 180 passed, 2 opt-in live skipped.

**Remaining:** conviction reflects current holdings, so a position sold down before resolution contributes only its remaining cost basis. Live CLOB midpoints need network access; tests use injected references.

## Omnibus inventory reconciliation (follow-up, 2026-09-17)

**What it does:** a read-only comparison of the internal ledger against the omnibus Polymarket account (`src/server/inventory`). It writes only its own `inventory_reconciliation_runs` / `inventory_findings` rows (migration `…_inventory_reconciliation`, no table rebuilds) and never alters balances, positions or fills.

**Authoritative source per dimension**
- **Share balances:** CLOB `GET /balance-allowance` (CONDITIONAL, per token), refreshed first via `/balance-allowance/update` because the server caches it. The spec defines it as fixed-math strings with 6 decimals. Compared per token against the sum of all positions on that token.
- **Fills:** `GET /data/trades` (L2-scoped) matched both ways against recorded `Fill.venueTradeId`.
  - Joined `tradeIDs`, `trade:order` maker ids and `order:<id>` references are understood.
  - Pro-rata splits across intents are summed per venue trade.
  - Our side of a trade is the taker's top-level fields, or only our `maker_orders` entries (funder address or API-key owner) with their own asset/side, so mint/merge maker legs are handled.
- **Cost basis:** each position is replayed from its own recorded fills (shares, cost basis, status).
- **pUSD:** `GET /balance-allowance` (COLLATERAL) against an optional operator baseline plus recorded fill cash flows. Without a baseline it is reported as unverifiable, never guessed.

**Findings:**
- `missing_shares`, `unexpected_shares`
- `venue_trade_not_in_ledger`, `ledger_fill_not_at_venue`
- `excess_recorded_fill` (duplicates), `short_recorded_fill`
- `position_shares_mismatch`, `cost_basis_mismatch`, `position_status_mismatch`
- `mixed_simulated_fills`, `usdc_balance_discrepancy`
- informational: `token_indeterminate` (orders still awaiting the venue), `not_reconcilable_simulated` (paper fills), `recovered_fill_unmatched_id`, `usdc_unverifiable`

Paper fills are excluded, so a paper ledger is never reported as discrepant.

**Operation**
- **Enablement:** only in live mode with Polymarket API credentials; otherwise it returns `disabled`.
- **Background job:** worker step `inventory`, at most every `VEYRA_INVENTORY_RECON_INTERVAL_MS`.
- **Operator API:** `GET/POST /api/operator/inventory-reconciliation`.
- **Concurrency:** a singleton `job_leases` lease; concurrent runs skip.
- **Determinism:** findings and the run `fingerprint` are deterministic, so re-running over unchanged state gives the same fingerprint.

**Tests:** migrated SQLite with a scripted venue that keeps its own trade log and balances. Scenarios:
- consistent opposing YES/NO holdings (same wallet on both sides)
- a venue trade missing from the ledger
- a ledger fill the venue never executed
- a duplicated fill
- partial fills (exact, and under-recorded)
- a flattened buy/sell
- corrupted cost basis
- paper-only fills
- pending orders (indeterminate)
- the pUSD baseline
- three concurrent runs (one completes, two skip, identical fingerprint on re-run, ledger byte-identical)
- a venue failure (run FAILED, lease released, next run succeeds)
- maker/taker/mint-merge trade interpretation
- reference parsing

Mutation-checked: counting simulated fills, aggregating shares globally instead of per token, not summing duplicate fills per venue trade, and ignoring pending orders are each caught. Fresh DB + running app: the operator API is 403 without a token and `disabled` in paper mode; the worker step is healthy. Full suite: 194 passed, 2 opt-in live skipped.

**Not verified — requires live credentials:** this has never run against a real Polymarket account (Veyra has not placed a live order). Must be confirmed on the first live run:
- The size/price units of `/data/trades` (docs show decimal strings, the OpenAPI example shows a base-unit-like value; parsed as decimals, consistent with existing live fill parsing). A units error would surface as `short_recorded_fill`/`excess_recorded_fill` findings, not silently.
- Whether `balance-allowance` excludes funds locked in open orders.
- Which address it reports for signature type 3.
- Data API `/positions` is deliberately not used (indexed, may lag).

## PostgreSQL + Vercel (2026-09-17)

The app is deployed on Vercel, which has no persistent disk, so SQLite was replaced by
PostgreSQL. The six SQLite migrations were squashed into one PostgreSQL baseline
(`20260917180000_init_postgres`) that keeps all 15 money/status CHECK constraints
(verified: `migrate deploy` clean, `migrate diff --exit-code` = 0, 15 rows in
`pg_constraint` with `contype = 'c'`).

**Concurrency bugs this exposed and fixed.** SQLite serialised writers, so a concurrent
`upsert` simply queued. PostgreSQL under READ COMMITTED does not: a bare (non-transactional)
upsert loses the race with P2002 instead of falling through to the update. Measured on the
test database: 140 of 160 concurrent upserts of one new row failed this way. Inside an
interactive transaction the same statements block and succeed, so only the bare paths were
at risk.
- `upsertMarket` — two first-time wagers on the same market: the loser's wager failed.
- `enqueueJob` (reputation) — two resolvers on the same market: resolution crashed. This was
  caught by the existing "concurrent and repeated scoring is idempotent" test.
- `saveScore` / `applyResolution` — concurrent scorers creating one wallet's parent row.
These three go through `withUniqueRetry` (`src/server/prisma-retry.ts`), which retries
P2002/P2034 and rethrows everything else.

`recordOpen` was hardened defensively, not because a collision was reproduced: its upserts
run inside a transaction and a probe of 120 concurrent calls produced zero P2002. It
previously treated *any* P2002 as "already recorded", which on the non-atomic upsert path
would undercount a wallet's totals; it now re-checks whether the prediction really was
recorded and otherwise retries. Row locks (`SELECT … FOR UPDATE`) were added to
`applyExecutionResult` and `reconcileAdjustment`, which relied on SQLite's writer lock.

**Serverless.** Functions freeze between requests, so the in-process worker cannot run:
`validateEnvironment` now rejects `VEYRA_WORKER_INTERVAL_MS > 0` on Vercel (boot deliberately
does not exit on serverless hosts, so this surfaces as `ready: false` in
`/api/operator/readiness` rather than a failed boot), `vercel.json`
schedules `GET /api/jobs/run` every minute, and that route accepts Vercel's `CRON_SECRET`
(constant-time compare, minimum 16 chars) as well as the operator token. `vercel-build`
runs `prisma migrate deploy` before `next build`, using `DIRECT_URL` because migrations
cannot run over a transaction pooler.

**Tests:** each Prisma suite now creates, migrates and drops its own PostgreSQL schema
(`src/server/testing/db.ts`), so suites no longer share state. Full suite: 211 passed,
2 skipped (live-RPC), run three times. Added: `withUniqueRetry` unit tests, cron-secret auth
tests, serverless env validation tests, and a concurrent `recordOpen` test asserting the
totals cannot undercount.

**Still per-process on Vercel:** the rate limiter and the conviction cache. Each lambda has
its own, so the effective rate limit is per-instance.

**Not verified — requires the real deployment:** nothing here has run against a pooled
(Neon/PgBouncer) connection; all tests used a direct local PostgreSQL. Prisma over a
transaction pooler can fail at runtime with `prepared statement "s0" already exists` while
every local test passes; if that appears in the function logs, `DATABASE_URL` needs
`?pgbouncer=true`. The transaction and `FOR UPDATE` semantics themselves are unaffected by
transaction pooling.

## Daily voting and two-wallet accounting (2026-09-19)

### Daily voting

One round every 24 hours: `OPEN -> CLOSED -> FINALIZED`. Users propose questions and
vote; when the round closes the tally is frozen and the top proposals become
Veyra-native pools.

- **One open round, guaranteed.** A partial unique index
  (`voting_round_single_open ... WHERE "status" = 'OPEN'`) means concurrent workers
  cannot open a second round; the loser sees P2002 and reads back the winner's row.
  No lease needed.
- **The vote budget is enforced under a row lock.** A per-wallet budget is a count
  check, which races by nature, so `castVote` locks the round row
  (`SELECT ... FOR UPDATE`) before counting. Without it two concurrent votes both
  read `used = N-1` and both commit; the test proves this.
- **Duplicate votes are a no-op, not an error.** Unique
  `(roundId, walletAddress, proposalId)`, so a retried request never double-counts.
  Duplicate proposals are blocked by unique `(roundId, normalizedTitle)`, so the same
  question cannot split its own vote.
- **Freezing is a row, not a query.** `voting_round_results` is written once at close
  and never recomputed. Votes arriving afterwards (by any path) cannot change the
  ranking or the selection.
- **Ties are deterministic and auditable:** votes desc, then earlier submission, then
  id. The resolved rank is stored, so the tiebreak can be checked after the fact.
- **Close and finalize are separate, re-drivable steps.** A worker that crashes after
  the CLOSED claim leaves a round the next tick finishes; a single combined step
  would strand it forever. Pool ids are derived from the proposal id
  (`veyra-<proposalId>`), so re-running finalization upserts the same rows.
- Pools are created with `source: "veyra"` and no CLOB tokens, so they never enter
  the live Polymarket execution path (`resolveBook` in `betting/service.ts`).

**Tests:** 12 scenarios — concurrent round opening, concurrent votes against the
budget, concurrent votes from many wallets, duplicate votes and proposals, closing,
frozen tally vs late votes, four-way tie ordering, duplicate finalization, a round
left CLOSED by a crashed worker, five workers ticking together, an unvoted round, and
history retention. Mutation-checked: removing the round lock, the atomic close claim,
or the freeze each fails a test.

### Two-wallet architecture

1. **Deposit/treasury wallet** — `VEYRA_TREASURY_ADDRESS`, address only. There is
   deliberately **no treasury private key env var**, and `validateEnvironment`
   errors if one is set. The server therefore cannot move deposited funds at all,
   which is what makes "never use this wallet for Polymarket execution" structural
   rather than a convention. Ownership lives in an append-only ledger
   (`treasury_ledger_entries`) with a derived balance per (wallet, asset), plus a
   CHECK that a custodial balance can never go negative.
2. **Polymarket execution wallet** — the existing omnibus signer, funded separately.
   Each user's share of it is the internal position/fill ledger, which changes only
   from recorded venue fills.

Boot fails if the two addresses are equal. Deposits are idempotent per
`(chainId, txHash, logIndex)`, so a watcher replaying a log credits exactly once, and
amounts are BigInt base units with the asset's `decimals` recorded — never floats.
The operator report exposes addresses and per-ledger totals only, and asserts in test
that no key material can appear in it.

**Tests:** 9 scenarios plus 5 env-validation tests. Mutation-checked: removing the
separation gate or the deposit idempotency each fails a test.

**Not built (deliberately):** no smart contracts, and no on-chain deposit watcher —
`POST /api/operator/treasury/deposits` is the trusted ingress, so crediting is driven
by an operator/watcher that has already confirmed the transfer, never by the
depositing user. Withdrawals are not implemented; the ledger supports the entry kind
but no endpoint moves funds out.

### New endpoints
- `GET /api/voting/round`, `POST /api/voting/proposals`, `POST /api/voting/votes`
- `GET /api/voting/rounds`, `GET /api/voting/rounds/[id]` (frozen audit trail)
- `GET /api/treasury/balances`, `GET /api/treasury/exposure` (signed-in wallet)
- `POST /api/operator/treasury/deposits`, `GET /api/operator/treasury/report`


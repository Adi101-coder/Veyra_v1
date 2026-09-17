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
- Rate limiter and conviction cache are per-process; multi-instance deployments need a shared store. SQLite is single-writer.
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
- `src/server/chain/settlement.ts` + worker `settlement` step: scored predictions → queued → signed (raw bytes persisted **before** broadcast) → submitted → confirmed only from a mined receipt. Also: retry with backoff, then failed; stale `signing` lease reclaim; rebroadcast of the same bytes; dropped-nonce detection → re-sign; wrong-chain RPC never signs; no new nonce while unbroadcast bytes exist.
- `GET /api/chain/status` (public: network, RPC chain match, head block, signer address/balance). Prediction DTOs carry `settlement`, and the wager page shows "Settling / Settled · tx".

**Tests** (139 passing + 2 opt-in live): chain config and gating; wallet switch/add/reject/pending/stubborn wallet; RPC client against a simulated JSON-RPC node that verifies signatures, chain id and nonces; settlement lifecycle on a migrated DB (happy path with payload decode, crash between sign and broadcast, backoff to failed, wrong chain, revert, confirmation threshold, dropped nonce, disabled, DB rejects receipt-less confirmation); full e2e extended to a confirmed settlement receipt. Live (opt-in `RH_LIVE_RPC_TEST=1`, run and passing): testnet 46630 and mainnet 4663 RPCs, balance read, receipt-not-found. A signed tx from an unfunded throwaway key was rejected by the real testnet and classified `insufficient_funds`.

**Running app (real testnet RPC, unfunded throwaway key):** `/api/chain/status` reports chain 46630 at the live head. The full HTTP flow (sign-in → bet → paper fill → 80→60 → resolve → score) created a settlement reference that correctly stayed `queued/insufficient_funds` with no transaction sent; the wager page shows "Settling".

**Found and fixed during verification:** stale cached block numbers in confirmation counts. The amended (unreleased) init migration left the earlier local dev DB missing `execution_intents.claimedAt`; the dev DB was rebuilt from migrations. The init migration exists only on this branch — any DB created from an earlier build of this branch must be recreated.

**Still needs real funds:** an actual confirmed testnet settlement (fund the signer with testnet ETH and set `RH_SETTLEMENT_ENABLED=true`); wallet-extension switching in a real browser wallet; mainnet. Reorgs deeper than `RH_CONFIRMATIONS` are not re-checked after confirmation. Settlement signing assumes one active signer process (a second concurrent process could race a nonce; that is detected as a drop and re-signed, not duplicated).

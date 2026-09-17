# Veyra end-to-end audit

Status: in progress (branch `audit/end-to-end`).

## Baseline
- Stack: Next.js 16 App Router, Prisma + SQLite, `@polymarket/clob-client-v2`, vitest.
- Baseline: 12 test files / 73 tests passing. No migrations directory (schema applied with `db push`). No authentication.

## Findings backlog (P0 = funds/settlement)

### Execution / Polymarket
- [ ] P0 Live client fabricated fills by walking the local book after posting (`simulated: false`) — accepted treated as filled.
- [ ] P0 `submitSlice` re-posted orders on any non-filled result (resting, delayed, timeout) — duplicate live orders.
- [ ] P0 Accepted-but-unfilled live orders marked FAILED; later venue fills never reconciled.
- [ ] P0 `fetchClobOrder` used unauthenticated `/order/{id}`; official endpoint is `/data/order/{id}` with L2 auth.
- [ ] P0 Initial Position stored engine's *desired* shares/notional; fills only changed status.
- [ ] P0 `claimQueued` not atomic across processes (find → update → find).
- [ ] P0 `enqueueAndProcess` returns an in-flight run that excludes the new intent → execution marked failed while intent stays QUEUED and executes later.
- [ ] P1 Synthetic book used for sizing when a live token has no asks, or for catalog markets with no token.
- [ ] P1 Two duplicate live submitters (`executor.ts`, `client.ts`); signature type / funder not configurable.
- [ ] P1 `syncExecution` could insert the same venue fills repeatedly.

### Auth / API
- [ ] P0 No authentication: any caller can place/adjust for any wallet.
- [ ] P0 `POST /api/markets/[id]/resolve` accepts any outcome from anyone; `/api/executions/flush`, `/api/reputation/flush`, `/api/executions/[id]/sync` unauthenticated.
- [ ] P1 Idempotency key optional server-side (NULL defeats unique constraint).

### Reputation / Conviction
- [ ] P0 Failed/zero-fill predictions scored; PnL/ROI used planned size not fills.
- [ ] P0 Only newest 100 predictions per market scored (`take` cap).
- [ ] P0 Resolved market re-opened by `upsertMarket`; no check blocking bets/adjustments on resolved markets.
- [ ] P1 FAILED/stuck resolution jobs never retried; conflicting outcome silently ignored; no INVALID outcome.
- [ ] P1 Scoring race → P2002 marks job FAILED; `processJobs` stops on lost claim.
- [ ] P1 `recordOpen` non-atomic and counts failed orders.
- [ ] P1 Wallet case inconsistency (0x addresses).
- [ ] P1 Conviction counts failed positions; hedged wallets' capital assigned to latest side.
- [ ] P1 SSE stream leaks intervals on 404/early abort; no cancel().

### Database
- [ ] P1 No migrations; fresh DB not reproducible.

### Frontend
- [ ] P0 Idempotency key regenerated per click; double-submit guarded only by disabled state.
- [ ] P0 Stale quote can be submitted during debounce.
- [ ] P1 No indication of synthetic book / static catalog market.
- [ ] P1 `predictionToWagerRow` shows failed as resolved/LOCKED.
- [ ] P1 Risk meters parse USD as SOL → always 0.
- [ ] P1 Fake creator/wager addresses & dates (`fakePubkey`).
- [ ] P1 Dashboard labels static catalog as live on fetch failure.
- [ ] P2 Conviction stream ordering/errors; failed loads shown as empty; execution status not refreshed.

## External integrations verified against official docs (2026-09-17)
- Polymarket CLOB: `/book` (live ordering bids asc / asks desc — engine sorts), `/price`, `/data/order/{id}` (L2), `/data/trades` (L2), POST `/order` response (`success, errorMsg, orderID, status, makingAmount, takingAmount, tradeIDs`), tick sizes, signature types 0–3, chain 137/80002, fees (taker only).
- Gamma: resolution = `closed && umaResolutionStatus == "resolved"`, winner = outcomePrices index with "1".
- Robinhood Chain: not used anywhere in this repo (wallets are EVM MetaMask/Binance + Solana). Official: mainnet 4663 `https://rpc.mainnet.chain.robinhood.com`, testnet 46630. Nothing to verify in code.

## Fixed

## Remaining / needs real credentials

## Production risks

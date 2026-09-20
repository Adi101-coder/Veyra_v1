# Veyra launch checklist

Plug-in order for a production (live) deployment. Every step is checkable; do not skip the small live test.

## 1. Accounts and funds
- [ ] Omnibus Polymarket signer key generated in your secret manager (never on a laptop).
- [ ] Signature type decided: `0` (EOA holds funds) or `1/2/3` with the proxy/safe/deposit wallet as `POLYMARKET_FUNDER_ADDRESS`.
- [ ] Funder wallet funded with pUSD, and trading allowances approved on Polymarket.
- [ ] Polymarket L2 API key/secret/passphrase created for the signer.
- [ ] Dedicated Polygon RPC and Robinhood Chain RPC (provider URLs with keys).
- [ ] Robinhood Chain settlement signer funded with ETH on the chosen network (testnet first).

## 2. Configure
- [ ] Copy `.env.production.example` → `.env.production`, fill every value (or inject via your platform's secret store).
- [ ] `openssl rand -hex 32` for `VEYRA_SESSION_SECRET`, `openssl rand -hex 24` for `VEYRA_OPERATOR_TOKEN`.
- [ ] `DATABASE_URL` is a PostgreSQL connection string. On Vercel/Neon use the **pooled** URL here and the **direct** (unpooled) URL in `DIRECT_URL`; `prisma migrate deploy` cannot run over a transaction pooler.

## 3. Deploy

### Vercel (serverless) — the current target
The in-process worker cannot run on serverless: functions are frozen between requests.
`vercel.json` therefore schedules `GET /api/jobs/run` every minute.
- [ ] Postgres provisioned (Vercel Postgres / Neon); `DATABASE_URL` (pooled) and `DIRECT_URL` (direct) set for Production.
- [ ] `VEYRA_WORKER_INTERVAL_MS="0"`. Serverless functions freeze between requests, so an
  in-process worker silently does nothing. Boot does not exit on Vercel (that would 500 every
  request), so this shows up as an error in `/api/operator/readiness`, which then reports
  `ready: false`.
- [ ] `CRON_SECRET` set (>= 16 chars). Vercel Cron sends it as `Authorization: Bearer $CRON_SECRET`; the operator token also works.
- [ ] `DATABASE_URL`/`DIRECT_URL` are scoped to the Production environment (or gate previews),
  since `vercel-build` migrates only when `VERCEL_ENV=production`.
- [ ] Deploy. `vercel-build` runs `prisma migrate deploy` (over `DIRECT_URL`) before `next build`.
- [ ] Cron tab shows `/api/jobs/run` succeeding; a minute-level schedule needs a Pro plan (Hobby is once per day).

### Self-hosted (one long-lived instance, `VEYRA_WORKER_INTERVAL_MS > 0`)
```bash
npm ci
npm run db:migrate          # prisma migrate deploy on a fresh or existing DB
npm run build
NODE_ENV=production npm run start
```
- [ ] Boot log shows `[env] execution mode: live` and no `[env]` errors. A misconfigured production server exits instead of starting.
- [ ] `GET /api/health` → `{"ok":true}` (use for load-balancer health checks).

### Pooled connections — verify on the first deploy
Prisma over a transaction pooler (Neon/PgBouncer) can fail at runtime with
`prepared statement "s0" already exists` while every local test passes. If that appears in the
function logs, append `?pgbouncer=true` (and a small `connection_limit`) to `DATABASE_URL`.
The interactive transactions and `SELECT … FOR UPDATE` locks are safe under transaction

## 4. Readiness (operator)
```bash
curl -H "Authorization: Bearer $VEYRA_OPERATOR_TOKEN" https://<host>/api/operator/readiness
```
It must return HTTP 200 and `"ready": true`. Check:
- [ ] `checks.database`: no pending migrations.
- [ ] `checks.polymarketClob` and `checks.polymarketGamma`: ok.
- [ ] `checks.polymarketAccount`: ok. This is an authenticated read of the funder's pUSD balance; it proves the key, API credentials and signature type together.
- [ ] `checks.robinhoodChain`: correct `chainId`, signer balance > 0 when settlement is enabled.
- [ ] `environment.warnings` reviewed.

## 5. Set the reconciliation baseline
- [ ] Record the funder pUSD balance from readiness (`collateralMicros`) and the current time into `VEYRA_OMNIBUS_USDC_BASELINE_MICROS` / `VEYRA_OMNIBUS_USDC_BASELINE_AT`, then restart.

## 6. Small live test (required before opening to users)
Keep `VEYRA_MAX_STAKE_USD` low (e.g. 5–100). Keep
`VEYRA_CUSTODY_ENABLED=false` — this is a venue-format test, not a real-money test.
Set `POLYMARKET_EXECUTION_MODE=live` only for this operator-controlled run.
- [ ] Connect a real wallet and sign in (one signature, no gas).
- [ ] Place one small wager on a liquid Polymarket market. The position shows **Filled** or **Partially filled** only after the venue reports the fill.
- [ ] Change confidence once (SELL or BUY delta) and confirm confidence history shows **Applied**.
- [ ] `POST /api/operator/inventory-reconciliation` (operator token): no `error` findings. This step confirms the unverified venue formats: `/data/trades` size units, maker/taker side, and whether the pUSD balance includes open-order funds.
- [ ] After a test market resolves: `GET /api/users/<wallet>/reputation` shows the score, and the wager page shows **Robinhood Chain · Settled** with an explorer link.

## 6b. Veyra pools (liquidity fund)
Veyra-native pools from daily voting price against an LMSR market maker that **Veyra
funds**, unlike Polymarket markets where the counterparty is another trader.
- [ ] Seed the fund with operator capital: `POST /api/operator/liquidity`
  (`amountMicros`, `reference`). Fees cannot bootstrap it — at launch there is no
  trading to generate them.
- [ ] Decide `VEYRA_POOL_BUDGET_MICROS`. That figure is the **worst case each pool can
  lose**, and 5 pools open per day; budget accordingly.
- [ ] Confirm `GET /api/operator/liquidity` shows the expected fund total, allocated
  amount and reserve.
- [ ] A pool the fund cannot cover stays unquotable and reports `AWAITING_LIQUIDITY`
  rather than showing a price. That is intended: an unfunded pool has no counterparty.
- [ ] Resolve a pool with `POST /api/operator/pools/resolve` (`marketId`, `outcome`).
  Pools have no venue oracle, so an operator decides. Cash payouts and liquidity
  close wait for `VEYRA_POOL_DISPUTE_WINDOW_HOURS` or
  `POST /api/operator/pools/finalize`.
- [ ] Pools trade in paper mode. No real money moves until execution is switched on
  for them, and that needs the custody and regulatory position settled first.

## 7. Operate
- [ ] Monitor `GET /api/operator/readiness`, `GET /api/operator/inventory-reconciliation`, and `GET /api/operator/treasury/report` solvency (alert on `ready: false` or any `error` finding).
- [ ] If function logs show `prepared statement "s0" already exists`, add `?pgbouncer=true` to the pooled `DATABASE_URL` only. Keep `DIRECT_URL` unpooled.
- [ ] Alert on `checks.worker.detail.batchesAwaitingVenueOver1h > 0` (orders needing manual reconciliation).
- [ ] Raise `VEYRA_MAX_STAKE_USD` only after reconciliation stays clean.

## Known limits at launch
- The rate limiter and conviction cache are per-process: with several instances (or Vercel's many lambdas) both are per-instance. The database is PostgreSQL and safe to share.
- The live Polymarket path has been exercised only against scripted venues until step 6 passes.
- Mainnet Robinhood Chain settlement needs `RH_NETWORK=mainnet` + `RH_ENABLE_MAINNET=true` + `RH_RPC_URL` + `NEXT_PUBLIC_RH_NETWORK=mainnet`.

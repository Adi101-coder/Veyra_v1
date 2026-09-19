# Veyra

Confidence-based prediction markets on top of Polymarket, with Robinhood Chain settlement
references. Next.js App Router (TypeScript, Tailwind), Prisma + PostgreSQL, vitest.

- `LAUNCH.md` — deployment checklist (Vercel and self-hosted).
- `AUDIT.md` — what each subsystem guarantees, and what still needs live credentials.

## Layout

- `src/app` — routes and API handlers (`src/app/api/**/route.ts`)
- `src/components` — U
- `src/server` — betting engine, Polymarket client, execution, reputation, conviction,
  inventory reconciliation, chain settlement, background worker
- `prisma/schema.prisma` — data model and migrations

## Local development

Requires a PostgreSQL 14+ server. Money is stored as BigInt micros and prices as
integer bps, which the schema enforces with CHECK constraints.

```bash
cp .env.example .env            # set DATABASE_URL and DIRECT_URL
npm install
npm run db:migrate              # prisma migrate deploy
npm run dev                     # http://localhost:3000
```

## Tests

Each Prisma suite creates its own PostgreSQL schema, migrates it and drops it afterwards,
so suites never share state. Point `TEST_DATABASE_URL` at a throwaway database
(default: `postgresql://veyra@127.0.0.1:5544/veyra_test`):

```bash
npm test                                    # everything
npm test -- src/server/reputation           # one area
TEST_DATABASE_URL="postgresql://…" npm test
```

## Background jobs

`src/server/worker.ts` drives order flush, venue reconciliation, resolutions, reputation
scoring, conviction snapshots, inventory reconciliation and chain settlement. It runs
in-process when `VEYRA_WORKER_INTERVAL_MS > 0`, and on serverless it must instead be
driven by a scheduler calling `/api/jobs/run` (see `vercel.json`).

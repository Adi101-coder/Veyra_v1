import "server-only";

import { readdir } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { getNativeBalance, getRpcStatus } from "@/server/chain/client";
import { publicChainConfig } from "@/server/chain/config";
import { getRobinhoodClients } from "@/server/chain";
import { polymarketJson, polymarketReachable } from "@/lib/polymarket-http";
import { validateEnvironment } from "@/server/env";
import { lastOmnibusOnchain, readOmnibusOnchain } from "@/server/treasury/omnibus-onchain";

type Check = { ok: boolean; critical: boolean; detail: Record<string, unknown> };

async function timed<T>(fn: () => Promise<T>, ms = 8_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

const message = (error: unknown) => (error instanceof Error ? error.message.slice(0, 200) : String(error));

/**
 * Operator readiness: every check is read-only and reports presence/health, never
 * secret values. `ready` is true only when the environment validates and every
 * critical dependency for the configured mode responds.
 */
export async function readinessReport(prisma: PrismaClient, env: Record<string, string | undefined> = process.env) {
  const environment = validateEnvironment(env);
  const checks: Record<string, Check> = {};

  try {
    await timed(() => prisma.$queryRaw`SELECT 1`);
    const applied = await prisma.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    let expected: string[] | null = null;
    try {
      const dir = path.join(process.cwd(), "prisma", "migrations");
      expected = (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    } catch {
      expected = null; // migrations folder not shipped with this build
    }
    const appliedNames = new Set(applied.map((row) => row.migration_name));
    const pending = expected ? expected.filter((name) => !appliedNames.has(name)) : [];
    checks.database = { ok: pending.length === 0, critical: true, detail: { appliedMigrations: appliedNames.size, pendingMigrations: pending } };
  } catch (error) {
    checks.database = { ok: false, critical: true, detail: { error: message(error) } };
  }

  const clob = env.POLYMARKET_CLOB_URL ?? "https://clob.polymarket.com";
  try {
    const probe = await timed(() => polymarketReachable(`${clob}/ok`), 15_000);
    checks.polymarketClob = { ok: probe.ok, critical: environment.mode === "live", detail: { status: probe.status } };
  } catch (error) {
    checks.polymarketClob = { ok: false, critical: environment.mode === "live", detail: { error: message(error) } };
  }

  if (environment.mode === "live") {
    try {
      const { createLiveInventoryVenue } = await import("@/server/polymarket/live");
      const venue = await timed(() => createLiveInventoryVenue(), 25_000);
      const collateral = await timed(() => venue.getCollateralBalance(), 20_000);
      // Authenticated, read-only: proves the key, API credentials and signature type work.
      checks.polymarketAccount = { ok: true, critical: true, detail: { network: venue.network, collateralMicros: collateral.toString() } };

      // Reachable and authenticated is not the same as able to trade. The CLOB
      // reports USABLE collateral: real money in the funder with no allowance to
      // the exchanges reads as zero here and every order fails with
      // "not enough balance / allowance ... balance: 0" only once submitted.
      // Reporting that in preflight is the difference between a config note and
      // a failed live order.
      try {
        const { readOmnibusOnchain, POLYMARKET_USDC_SPENDERS } = await import(
          "@/server/treasury/omnibus-onchain"
        );
        const snapshot = await timed(() => readOmnibusOnchain(), 20_000);
        const held = BigInt(snapshot?.usdcEMicros ?? "0");
        const missing = (snapshot?.allowances ?? [])
          .filter((row) => BigInt(row.usdcE) <= 0n)
          .map((row) => row.name);
        const ok = collateral > 0n && missing.length === 0;
        checks.polymarketCollateral = {
          ok,
          critical: true,
          detail: {
            funder: snapshot?.address ?? null,
            usableCollateralMicros: collateral.toString(),
            heldUsdcEMicros: held.toString(),
            missingAllowances: missing,
            hint:
              missing.length > 0
                ? `The funder holds ${held} USDC.e but has not approved ${missing.join(" and ")}. Orders will be refused until it does. A funder that is a Polymarket deposit wallet cannot approve for itself: connect its signer at polymarket.com and make one trade, which sets these.`
                : collateral <= 0n
                  ? "The venue reports no usable collateral. Fund the funder address with USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174), not native USDC."
                  : undefined,
            spenders: POLYMARKET_USDC_SPENDERS.map((row) => row.name),
          },
        };
      } catch (error) {
        checks.polymarketCollateral = { ok: false, critical: false, detail: { error: message(error) } };
      }
    } catch (error) {
      checks.polymarketAccount = { ok: false, critical: true, detail: { error: message(error) } };
    }
  }

  const gamma = env.POLYMARKET_GAMMA_URL ?? "https://gamma-api.polymarket.com";
  try {
    await timed(() => polymarketJson(`${gamma}/markets?limit=1`, 15_000), 20_000);
    checks.polymarketGamma = { ok: true, critical: true, detail: { via: "bridge-or-direct" } };
  } catch (error) {
    checks.polymarketGamma = { ok: false, critical: true, detail: { error: message(error) } };
  }

  try {
    const snapshot = await timed(() => readOmnibusOnchain(env), 8_000);
    const last = lastOmnibusOnchain();
    checks.omnibusOnchain = {
      ok: Boolean(snapshot) || Boolean(last.snapshot),
      critical: false,
      detail: snapshot ?? last.snapshot ?? { error: last.error ?? "skipped" },
    };
  } catch (error) {
    const last = lastOmnibusOnchain();
    checks.omnibusOnchain = {
      ok: Boolean(last.snapshot),
      critical: false,
      detail: last.snapshot ?? { error: message(error) },
    };
  }

  try {
    const clients = getRobinhoodClients();
    const rpc = await getRpcStatus(clients);
    const signer = clients.account && rpc.ok ? await getNativeBalance(clients, clients.account.address).catch(() => null) : null;
    const settlement = clients.config.settlementEnabled;
    checks.robinhoodChain = {
      ok: rpc.ok && (!settlement || (signer ?? 0n) > 0n),
      critical: settlement,
      detail: {
        ...publicChainConfig(clients.config),
        rpc: rpc.ok ? { chainId: rpc.chainId, blockNumber: rpc.blockNumber.toString(), latencyMs: rpc.latencyMs } : { error: rpc.error },
        signer: clients.account ? { address: clients.account.address, balanceWei: signer?.toString() ?? null } : null,
      },
    };
  } catch (error) {
    checks.robinhoodChain = { ok: false, critical: false, detail: { error: message(error) } };
  }

  try {
    const [batch, job, inventory, lease] = await Promise.all([
      prisma.executionBatch.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true, status: true } }),
      prisma.reputationJob.findFirst({ orderBy: { createdAt: "desc" }, select: { status: true, processedAt: true } }),
      prisma.inventoryReconciliationRun.findFirst({ orderBy: { startedAt: "desc" }, select: { status: true, startedAt: true, findingCount: true } }),
      prisma.jobLease.findMany({ select: { name: true, leaseUntil: true } }),
    ]);
    const stuck = await prisma.executionBatch.count({ where: { status: "SUBMITTED", updatedAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } } });
    checks.worker = {
      ok: stuck === 0,
      critical: false,
      detail: {
        inProcessWorker: environment.configured.worker,
        lastExecutionBatch: batch ? { status: batch.status, at: batch.updatedAt.toISOString() } : null,
        lastReputationJob: job ? { status: job.status, processedAt: job.processedAt?.toISOString() ?? null } : null,
        lastInventoryReconciliation: inventory ? { status: inventory.status, at: inventory.startedAt.toISOString(), findings: inventory.findingCount } : null,
        batchesAwaitingVenueOver1h: stuck,
        leases: lease.map((row) => ({ name: row.name, until: row.leaseUntil.toISOString() })),
      },
    };
  } catch (error) {
    checks.worker = { ok: false, critical: false, detail: { error: message(error) } };
  }

  const ready = environment.errors.length === 0 && Object.values(checks).every((check) => check.ok || !check.critical);
  return {
    ready,
    mode: environment.mode,
    environment: { errors: environment.errors, warnings: environment.warnings, configured: environment.configured },
    checks,
    checkedAt: new Date().toISOString(),
  };
}

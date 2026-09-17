import "server-only";

import type { PrismaClient } from "@prisma/client";
import { acquireLease, releaseLease } from "@/server/jobs/lease";
import {
  reconcileInventory,
  type LedgerSnapshot,
  type ReconcileConfig,
  type VenueSnapshot,
  type VenueTrade,
} from "@/server/inventory/reconcile";

export const INVENTORY_LEASE = "inventory-reconciliation";

/** Read-only view of the omnibus Polymarket account. Every value comes from the venue. */
export type InventoryVenue = {
  network: string;
  getTokenBalance(tokenId: string): Promise<bigint>;
  getCollateralBalance(): Promise<bigint>;
  listTrades(since: Date | null): Promise<VenueTrade[]>;
};

const PENDING_EXECUTION = ["created", "submitted", "open", "unknown"];

/** Loads the ledger with plain reads only. Nothing here writes to positions or fills. */
export async function loadLedgerSnapshot(prisma: PrismaClient): Promise<LedgerSnapshot> {
  const positions = await prisma.position.findMany({
    select: { id: true, predictionId: true, tokenId: true, status: true, sharesMicros: true, notionalMicros: true, avgPriceBps: true },
    orderBy: { id: "asc" },
  });
  const fills = await prisma.fill.findMany({
    include: { execution: { select: { id: true, side: true, tokenId: true, createdAt: true, position: { select: { predictionId: true } } } } },
    orderBy: { id: "asc" },
  });
  const pending = await prisma.execution.groupBy({
    by: ["tokenId"],
    where: { status: { in: PENDING_EXECUTION }, mode: { not: "paper" } },
    _count: { _all: true },
  });
  return {
    positions: positions.map((row) => ({
      positionId: row.id,
      predictionId: row.predictionId,
      tokenId: row.tokenId,
      status: row.status,
      sharesMicros: row.sharesMicros,
      notionalMicros: row.notionalMicros,
      avgPriceBps: row.avgPriceBps,
    })),
    fills: fills.map((row) => ({
      fillId: row.id,
      executionId: row.executionId,
      predictionId: row.execution.position.predictionId,
      tokenId: row.execution.tokenId,
      side: row.execution.side === "SELL" ? "SELL" : "BUY",
      venueTradeId: row.venueTradeId,
      sharesMicros: row.sharesMicros,
      notionalMicros: row.notionalMicros,
      feeMicros: row.feeMicros,
      isSimulated: row.isSimulated,
      filledAt: row.filledAt,
      executionCreatedAt: row.execution.createdAt,
    })),
    pendingByToken: new Map(pending.map((row) => [row.tokenId, row._count._all])),
  };
}

async function loadVenueSnapshot(venue: InventoryVenue, ledger: LedgerSnapshot): Promise<VenueSnapshot> {
  const realFills = ledger.fills.filter((fill) => !fill.isSimulated);
  const earliest = realFills.reduce<Date | null>((min, fill) => (!min || fill.filledAt < min ? fill.filledAt : min), null);
  // One day of slack before the first recorded real fill: venue match time precedes our record time.
  const tradesSince = earliest ? new Date(earliest.getTime() - 24 * 60 * 60 * 1000) : null;
  const trades = await venue.listTrades(tradesSince);
  const tokenIds = new Set<string>([
    ...ledger.positions.filter((position) => realFills.some((fill) => fill.predictionId === position.predictionId)).map((position) => position.tokenId),
    ...trades.map((trade) => trade.tokenId),
  ]);
  const tokenBalances = new Map<string, bigint>();
  for (const tokenId of [...tokenIds].sort()) tokenBalances.set(tokenId, await venue.getTokenBalance(tokenId));
  return { tokenBalances, collateralMicros: await venue.getCollateralBalance(), trades, tradesSince };
}

export function reconcileConfigFromEnv(env: Record<string, string | undefined> = process.env): ReconcileConfig {
  const micros = (key: string, fallback: bigint) => {
    const raw = env[key];
    return raw && /^\d+$/.test(raw) ? BigInt(raw) : fallback;
  };
  const baselineMicros = env.VEYRA_OMNIBUS_USDC_BASELINE_MICROS;
  const baselineAt = env.VEYRA_OMNIBUS_USDC_BASELINE_AT ? new Date(env.VEYRA_OMNIBUS_USDC_BASELINE_AT) : null;
  return {
    shareToleranceMicros: micros("VEYRA_RECON_SHARE_TOLERANCE_MICROS", 10_000n),
    usdcToleranceMicros: micros("VEYRA_RECON_USDC_TOLERANCE_MICROS", 10_000n),
    usdcBaseline:
      baselineMicros && /^\d+$/.test(baselineMicros) && baselineAt && !Number.isNaN(baselineAt.getTime())
        ? { micros: BigInt(baselineMicros), at: baselineAt }
        : null,
  };
}

export type ReconciliationResult =
  | { status: "disabled"; reason: string }
  | { status: "skipped"; reason: string }
  | { status: "completed" | "failed"; runId: string; fingerprint: string | null; summary: unknown; error?: string };

/**
 * One read-only reconciliation run. Holds a singleton lease so concurrent workers
 * never run it twice; writes only its own run/finding rows.
 */
export async function runInventoryReconciliation(input: {
  prisma: PrismaClient;
  venue: InventoryVenue | null;
  config?: ReconcileConfig;
  leaseTtlMs?: number;
  now?: () => Date;
}): Promise<ReconciliationResult> {
  if (!input.venue) {
    return { status: "disabled", reason: "Live Polymarket credentials are not configured (paper mode has no venue inventory)." };
  }
  const { prisma, venue } = input;
  const now = input.now ?? (() => new Date());
  const lease = await acquireLease(prisma, INVENTORY_LEASE, input.leaseTtlMs ?? 10 * 60 * 1000, now());
  if (!lease) return { status: "skipped", reason: "Another worker is reconciling." };
  const run = await prisma.inventoryReconciliationRun.create({ data: { status: "RUNNING", network: venue.network, startedAt: now() } });
  try {
    const ledger = await loadLedgerSnapshot(prisma);
    const venueSnapshot = await loadVenueSnapshot(venue, ledger);
    const result = reconcileInventory(ledger, venueSnapshot, input.config ?? reconcileConfigFromEnv());
    await prisma.$transaction([
      prisma.inventoryFinding.createMany({
        data: result.findings.map((item) => ({
          runId: run.id,
          kind: item.kind,
          severity: item.severity,
          tokenId: item.tokenId ?? null,
          predictionId: item.predictionId ?? null,
          executionId: item.executionId ?? null,
          venueTradeId: item.venueTradeId ?? null,
          expected: item.expected ?? null,
          actual: item.actual ?? null,
          detailJson: JSON.stringify(item.detail),
          fingerprint: item.fingerprint,
        })),
      }),
      prisma.inventoryReconciliationRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETED",
          finishedAt: now(),
          tradesSince: venueSnapshot.tradesSince,
          findingCount: result.findings.length,
          fingerprint: result.fingerprint,
          summaryJson: JSON.stringify(result.summary),
        },
      }),
    ]);
    return { status: "completed", runId: run.id, fingerprint: result.fingerprint, summary: result.summary };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Reconciliation failed";
    await prisma.inventoryReconciliationRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: now(), errorMessage: message } });
    console.error("[inventory] reconciliation failed", { runId: run.id, error: message });
    return { status: "failed", runId: run.id, fingerprint: null, summary: null, error: message };
  } finally {
    await releaseLease(prisma, INVENTORY_LEASE, lease);
  }
}

/** Latest completed/failed run with its findings, most severe first. */
export async function latestReconciliationReport(prisma: PrismaClient) {
  const run = await prisma.inventoryReconciliationRun.findFirst({
    where: { status: { in: ["COMPLETED", "FAILED"] } },
    orderBy: { startedAt: "desc" },
    include: { findings: true },
  });
  if (!run) return null;
  const rank = { error: 0, warning: 1, info: 2 } as Record<string, number>;
  return {
    id: run.id,
    status: run.status,
    network: run.network,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    tradesSince: run.tradesSince?.toISOString() ?? null,
    fingerprint: run.fingerprint,
    summary: run.summaryJson ? JSON.parse(run.summaryJson) : null,
    errorMessage: run.errorMessage,
    findings: run.findings
      .sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) || a.kind.localeCompare(b.kind) || a.fingerprint.localeCompare(b.fingerprint))
      .map((item) => ({
        kind: item.kind,
        severity: item.severity,
        tokenId: item.tokenId,
        predictionId: item.predictionId,
        executionId: item.executionId,
        venueTradeId: item.venueTradeId,
        expected: item.expected,
        actual: item.actual,
        detail: JSON.parse(item.detailJson),
      })),
  };
}

/** Live venue only when live mode and L2 API credentials are configured; otherwise null (job disabled). */
export async function configuredInventoryVenue(env: Record<string, string | undefined> = process.env): Promise<InventoryVenue | null> {
  if ((env.POLYMARKET_EXECUTION_MODE ?? "paper").toLowerCase() !== "live") return null;
  if (!env.POLYMARKET_PRIVATE_KEY || !env.POLYMARKET_API_KEY || !env.POLYMARKET_API_SECRET || !env.POLYMARKET_API_PASSPHRASE) return null;
  const { createLiveInventoryVenue } = await import("@/server/polymarket/live");
  return createLiveInventoryVenue();
}

/** Worker step: run at most once per VEYRA_INVENTORY_RECON_INTERVAL_MS (default 15 min). */
export async function runScheduledInventoryReconciliation(prisma: PrismaClient, now = new Date()) {
  const venue = await configuredInventoryVenue();
  if (!venue) return { status: "disabled" as const, reason: "live mode with API credentials required" };
  const interval = Number.parseInt(process.env.VEYRA_INVENTORY_RECON_INTERVAL_MS ?? "900000", 10);
  const last = await prisma.inventoryReconciliationRun.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true } });
  if (last && now.getTime() - last.startedAt.getTime() < (Number.isFinite(interval) ? interval : 900_000)) {
    return { status: "skipped" as const, reason: "interval not elapsed" };
  }
  return runInventoryReconciliation({ prisma, venue });
}

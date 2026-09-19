import "server-only";

import {
  createDefaultDeps,
  flushExecutions,
  processReputationJobs,
  recoverStuckAdjustments,
  recoverStuckExecutions,
  reconcileExecutions,
  syncMarketResolutions,
} from "@/server/betting/service";
import { runRobinhoodSettlementTick } from "@/server/chain";
import { getPrisma } from "@/server/db";
import { runScheduledInventoryReconciliation } from "@/server/inventory/service";
import { runVotingTick } from "@/server/voting/lifecycle";
import { fundPendingPools, settleResolvedPools } from "@/server/pools/settlement";

/**
 * Background jobs, in dependency order. Each step is idempotent and safe to run
 * concurrently with request handlers (claims are atomic in the database):
 *   1. flush      – execute intents left QUEUED
 *   2. reconcile  – re-read venue orders still SUBMITTED and record real fills
 *   3. resolutions – enqueue scoring for markets Gamma reports as resolved
 *   4. reputation – score resolved markets exactly once
 *   5. voting     – advance the 24h round lifecycle (OPEN -> CLOSED -> FINALIZED)
 * A failing step is logged and does not block the others.
 */
const STEPS = {
  recover: async () => {
    const deps = createDefaultDeps();
    return (await recoverStuckExecutions(deps)) + (await recoverStuckAdjustments(deps));
  },
  flush: async () => (await flushExecutions(createDefaultDeps())).length,
  reconcile: async () => (await reconcileExecutions(createDefaultDeps())).length,
  resolutions: async () => (await syncMarketResolutions(createDefaultDeps())).length,
  reputation: async () => (await processReputationJobs(createDefaultDeps())).length,
  // Read-only omnibus inventory check (disabled unless live credentials are set).
  inventory: async () => {
    const result = await runScheduledInventoryReconciliation(getPrisma());
    if (result.status === "failed") throw new Error(result.error ?? "inventory reconciliation failed");
    return result.status === "completed" ? 1 : 0;
  },
  // Daily voting: close due rounds, finalize closed ones into pools, open the next.
  voting: async () => {
    const result = await runVotingTick(getPrisma());
    return result.closed + result.finalized + result.opened;
  },
  // Settle Veyra pools whose market is resolved and scored: takes the fee and
  // books the pool's result against the liquidity fund. After reputation, which
  // produces the PnL these figures are derived from.
  pools: async () => {
    // Fund pools that opened while the fund was empty, then settle resolved ones.
    const funded = await fundPendingPools();
    const settled = await settleResolvedPools();
    return funded.length + settled.length;
  },
  // Runs after reputation so newly scored predictions get settlement references.
  settlement: async () => {
    const result = await runRobinhoodSettlementTick();
    return result.enabled ? result.submitted + result.receipts.confirmed : 0;
  },
} as const;

type StepName = keyof typeof STEPS;

let running: Promise<Record<StepName, { ok: boolean; count?: number; error?: string }>> | null = null;

export function runWorkerTick() {
  // Never overlap ticks inside one process.
  running ??= (async () => {
    const report = {} as Record<StepName, { ok: boolean; count?: number; error?: string }>;
    for (const name of Object.keys(STEPS) as StepName[]) {
      try {
        report[name] = { ok: true, count: await STEPS[name]() };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[worker] ${name} failed`, { error: message });
        report[name] = { ok: false, error: message };
      }
    }
    return report;
  })().finally(() => {
    running = null;
  });
  return running;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let stopping = false;
let failures = 0;

/** In-process loop with exponential backoff on failure and graceful shutdown. */
export function startWorkerLoop(intervalMs: number) {
  if (timer || stopping) return;
  const schedule = (delay: number) => {
    timer = setTimeout(async () => {
      if (stopping) return;
      const report = await runWorkerTick();
      const failed = Object.values(report).some((step) => !step.ok);
      failures = failed ? Math.min(failures + 1, 6) : 0;
      schedule(intervalMs * 2 ** failures);
    }, delay);
  };
  const stop = async () => {
    stopping = true;
    if (timer) clearTimeout(timer);
    await running?.catch(() => undefined);
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  schedule(intervalMs);
}

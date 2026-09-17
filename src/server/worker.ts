import "server-only";

import {
  createDefaultDeps,
  flushExecutions,
  processReputationJobs,
  reconcileExecutions,
  syncMarketResolutions,
} from "@/server/betting/service";

/**
 * Background jobs, in dependency order. Each step is idempotent and safe to run
 * concurrently with request handlers (claims are atomic in the database):
 *   1. flush      – execute intents left QUEUED
 *   2. reconcile  – re-read venue orders still SUBMITTED and record real fills
 *   3. resolutions – enqueue scoring for markets Gamma reports as resolved
 *   4. reputation – score resolved markets exactly once
 * A failing step is logged and does not block the others.
 */
const STEPS = {
  flush: async () => (await flushExecutions(createDefaultDeps())).length,
  reconcile: async () => (await reconcileExecutions(createDefaultDeps())).length,
  resolutions: async () => (await syncMarketResolutions(createDefaultDeps())).length,
  reputation: async () => (await processReputationJobs(createDefaultDeps())).length,
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

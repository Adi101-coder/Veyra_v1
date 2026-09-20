import "server-only";

import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/server/db";
import { releaseHold, settlesInCash } from "@/server/treasury/funds";

const TERMINAL = ["filled", "partial", "failed"] as const;

/**
 * Releases unused reservations once an execution can no longer fill.
 *
 * Spent is the recorded fills' notional plus fees — never the intended size.
 * Safe to re-run: `releaseHold` claims the ACTIVE row once.
 */
export async function releaseTerminalHolds(prisma: PrismaClient = getPrisma()) {
  const holds = await prisma.fundsHold.findMany({
    where: { status: "ACTIVE" },
    select: { executionId: true },
  });
  if (holds.length === 0) return { released: 0 };

  const executions = await prisma.execution.findMany({
    where: {
      id: { in: holds.map((row) => row.executionId) },
      status: { in: [...TERMINAL] },
    },
    include: { fills: { select: { notionalMicros: true, feeMicros: true } } },
  });

  let released = 0;
  for (const execution of executions) {
    if (!settlesInCash(execution.mode)) continue;
    const spent = execution.fills.reduce((sum, fill) => sum + fill.notionalMicros + fill.feeMicros, 0n);
    const result = await releaseHold(prisma, execution.id, spent);
    if (result.released) released += 1;
  }
  return { released };
}

/**
 * Reservations that have been open too long on an execution that never reached a
 * terminal state — a worker died mid-flight, or the venue never answered.
 *
 * Deliberately reports rather than releases. The order may still fill, and freeing
 * the money while that is possible would let the same balance be spent twice. An
 * operator decides, the same way inventory reconciliation reports rather than
 * adjusts.
 */
export async function staleHolds(
  prisma: PrismaClient = getPrisma(),
  env: Record<string, string | undefined> = process.env,
  now = new Date(),
) {
  const hours = Number.parseInt((env.VEYRA_STALE_HOLD_HOURS ?? "24").trim(), 10);
  const cutoffHours = Number.isInteger(hours) && hours > 0 && hours <= 720 ? hours : 24;
  const cutoff = new Date(now.getTime() - cutoffHours * 60 * 60 * 1000);

  const holds = await prisma.fundsHold.findMany({
    where: { status: "ACTIVE", createdAt: { lt: cutoff } },
    select: { executionId: true, walletAddress: true, amountMicros: true },
  });
  if (holds.length === 0) return { count: 0, micros: 0n, executionIds: [] as string[] };

  // Only those whose execution is still not terminal: a terminal one is the sweep's
  // job and will be released on the next tick.
  const open = await prisma.execution.findMany({
    where: {
      id: { in: holds.map((row) => row.executionId) },
      status: { notIn: [...TERMINAL] },
    },
    select: { id: true },
  });
  const openIds = new Set(open.map((row) => row.id));
  const stuck = holds.filter((row) => openIds.has(row.executionId));
  return {
    count: stuck.length,
    micros: stuck.reduce((sum, row) => sum + row.amountMicros, 0n),
    executionIds: stuck.map((row) => row.executionId),
  };
}

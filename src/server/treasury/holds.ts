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

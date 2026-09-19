import "server-only";

import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/server/db";
import { creditCash, settlesInCash } from "@/server/treasury/funds";

/**
 * Credits proceeds from recorded SELL fills. Amount is notional minus fee, the
 * same convention reputation uses for `proceedsMicros`. Idempotent per Fill.id.
 */
export async function creditSellFills(prisma: PrismaClient = getPrisma()) {
  const fills = await prisma.fill.findMany({
    where: { execution: { side: "SELL" } },
    select: {
      id: true,
      notionalMicros: true,
      feeMicros: true,
      execution: { select: { mode: true, position: { select: { walletAddress: true } } } },
    },
  });

  let credited = 0;
  for (const fill of fills) {
    if (!settlesInCash(fill.execution.mode)) continue;
    const proceeds = fill.notionalMicros - fill.feeMicros;
    if (proceeds <= 0n) continue;
    const result = await creditCash(prisma, {
      walletAddress: fill.execution.position.walletAddress,
      amountMicros: proceeds,
      kind: "SELL_CREDIT",
      refType: "Fill",
      refId: fill.id,
    });
    if (result.credited) credited += 1;
  }
  return { credited };
}

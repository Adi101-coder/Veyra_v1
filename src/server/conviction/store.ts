import type { PrismaClient } from "@prisma/client";
import type {
  ConvictionPosition,
  ConvictionSnapshotRow,
  ConvictionStore,
} from "@/server/conviction/types";

const ELIGIBLE_EXCLUDED_STATUSES = ["pending", "failed"];

/** In-memory store for unit tests. */
export function memoryConvictionStore(
  positions: (ConvictionPosition & { marketId: string })[] = [],
  resolutions: Map<string, { outcome: string; resolvedAt: Date }> = new Map(),
): ConvictionStore & { positions: (ConvictionPosition & { marketId: string })[] } {
  const snapshots: ConvictionSnapshotRow[] = [];
  let seq = 1;
  return {
    positions,
    async listPositions(marketId) {
      return positions.filter((row) => row.marketId === marketId);
    },
    async getResolution(marketId) {
      return resolutions.get(marketId) ?? null;
    },
    async listSnapshots(marketId, limit) {
      return snapshots.filter((row) => row.marketId === marketId).slice(-limit);
    },
    async upsertSnapshot(row) {
      const existing = snapshots.find(
        (item) => item.marketId === row.marketId && item.bucketStart?.getTime() === row.bucketStart?.getTime(),
      );
      if (existing) return existing;
      const created = { ...row, id: `snap_${seq++}`, createdAt: new Date() };
      snapshots.push(created);
      return created;
    },
  };
}

export function prismaConvictionStore(prisma: PrismaClient): ConvictionStore {
  return {
    async listPositions(marketId) {
      // One statement: shares, cost basis and confidence are read from a single
      // consistent state (the ledger updates them in one transaction).
      const rows = await prisma.position.findMany({
        where: {
          marketId,
          sharesMicros: { gt: 0 },
          notionalMicros: { gt: 0 },
          status: { notIn: ELIGIBLE_EXCLUDED_STATUSES },
        },
        select: {
          predictionId: true,
          walletAddress: true,
          outcome: true,
          sharesMicros: true,
          notionalMicros: true,
          status: true,
          prediction: { select: { confidenceBps: true } },
        },
        orderBy: { predictionId: "asc" },
      });
      return rows.map((row) => ({
        predictionId: row.predictionId,
        walletAddress: row.walletAddress,
        outcome: row.outcome === "NO" ? "NO" : "YES",
        confidenceBps: row.prediction.confidenceBps,
        sharesMicros: row.sharesMicros,
        capitalMicros: row.notionalMicros,
        status: row.status,
      }));
    },
    async getResolution(marketId) {
      const market = await prisma.market.findUnique({
        where: { id: marketId },
        select: { resolvedOutcome: true, resolvedAt: true },
      });
      return market?.resolvedAt && market.resolvedOutcome
        ? { outcome: market.resolvedOutcome, resolvedAt: market.resolvedAt }
        : null;
    },
    async listSnapshots(marketId, limit) {
      const rows = await prisma.convictionSnapshot.findMany({
        where: { marketId },
        orderBy: { createdAt: "desc" },
        take: Math.max(1, limit),
      });
      return rows.reverse();
    },
    async upsertSnapshot(row) {
      try {
        return await prisma.convictionSnapshot.create({ data: row });
      } catch (error) {
        // Another process wrote this market's bucket first: keep that row.
        if ((error as { code?: string })?.code !== "P2002") throw error;
        return prisma.convictionSnapshot.findFirstOrThrow({
          where: { marketId: row.marketId, bucketStart: row.bucketStart },
        });
      }
    },
  };
}

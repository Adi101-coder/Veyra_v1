import type { Outcome } from "@/lib/betting";
import type { PrismaClient } from "@prisma/client";
import type {
  ConvictionSnapshotRow,
  ConvictionStore,
  ConvictionVote,
} from "@/server/conviction/types";

function asOutcome(value: string): Outcome {
  return value === "NO" ? "NO" : "YES";
}

/** Capital is the cost basis of shares actually held (from fills), never the requested stake. */
function voteCapital(row: { position: { notionalMicros: bigint } | null }) {
  return row.position?.notionalMicros ?? 0n;
}

export function memoryConvictionStore(seed: ConvictionVote[] = []): ConvictionStore {
  const votes = [...seed];
  const snapshots: ConvictionSnapshotRow[] = [];
  let seq = 1;

  return {
    async listVotes(marketId) {
      return votes.filter((vote) => vote.marketId === marketId);
    },
    async latestSnapshot(marketId) {
      const rows = snapshots.filter((row) => row.marketId === marketId);
      return rows[rows.length - 1] ?? null;
    },
    async listSnapshots(marketId, limit) {
      return snapshots.filter((row) => row.marketId === marketId).slice(-limit);
    },
    async insertSnapshot(row) {
      const saved: ConvictionSnapshotRow = {
        id: `snap-${seq++}`,
        createdAt: row.createdAt ?? new Date(),
        marketId: row.marketId,
        engineVersion: row.engineVersion,
        participants: row.participants,
        capitalMicros: row.capitalMicros,
        averageConfidenceBps: row.averageConfidenceBps,
        capitalWeightedConfidenceBps: row.capitalWeightedConfidenceBps,
        convictionBps: row.convictionBps,
        polymarketProbabilityBps: row.polymarketProbabilityBps,
        divergenceBps: row.divergenceBps,
        distributionJson: row.distributionJson,
      };
      snapshots.push(saved);
      return saved;
    },
  };
}

export function prismaConvictionStore(prisma: PrismaClient): ConvictionStore {
  return {
    async listVotes(marketId) {
      const rows = await prisma.prediction.findMany({
        // Only predictions whose position holds filled shares count toward conviction.
        where: { marketId, position: { sharesMicros: { gt: 0 } } },
        include: { position: true },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row) => ({
        predictionId: row.id,
        marketId: row.marketId,
        walletAddress: row.walletAddress,
        outcome: asOutcome(row.outcome),
        confidenceBps: row.confidenceBps,
        capitalMicros: voteCapital(row),
        createdAt: row.createdAt,
        status: row.position?.status ?? row.status,
      }));
    },
    async latestSnapshot(marketId) {
      return prisma.convictionSnapshot.findFirst({
        where: { marketId },
        orderBy: { createdAt: "desc" },
      });
    },
    async listSnapshots(marketId, limit) {
      const rows = await prisma.convictionSnapshot.findMany({
        where: { marketId },
        orderBy: { createdAt: "desc" },
        take: Math.max(1, limit),
      });
      return rows.reverse();
    },
    async insertSnapshot(row) {
      return prisma.convictionSnapshot.create({
        data: {
          marketId: row.marketId,
          engineVersion: row.engineVersion,
          participants: row.participants,
          capitalMicros: row.capitalMicros,
          averageConfidenceBps: row.averageConfidenceBps,
          capitalWeightedConfidenceBps: row.capitalWeightedConfidenceBps,
          convictionBps: row.convictionBps,
          polymarketProbabilityBps: row.polymarketProbabilityBps,
          divergenceBps: row.divergenceBps,
          distributionJson: row.distributionJson,
          createdAt: row.createdAt,
        },
      });
    },
  };
}

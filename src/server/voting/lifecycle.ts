import "server-only";

import type { PrismaClient } from "@prisma/client";
import { withUniqueRetry } from "@/server/prisma-retry";
import {
  loadVotingConfig,
  poolIdForProposal,
  VEYRA_POOL_SOURCE,
  type VotingConfig,
} from "@/server/voting/config";
import { openRound, rankProposals } from "@/server/voting/store";

/**
 * Round lifecycle: OPEN -> CLOSED -> FINALIZED.
 *
 * Closing and finalizing are separate steps on purpose. A worker that crashes after
 * closing leaves a CLOSED round, which the next tick finishes; a single combined
 * step would strand that round forever. Both steps are idempotent, so running them
 * twice (or from two workers at once) changes nothing.
 */

/**
 * OPEN -> CLOSED, and freeze the tally.
 *
 * The status change is an atomic claim: exactly one worker gets `count === 1` and
 * writes the results. The result rows are the frozen record — ranking is never
 * recomputed from votes afterwards.
 */
export async function closeDueRounds(prisma: PrismaClient, now = new Date()) {
  const due = await prisma.votingRound.findMany({
    where: { status: "OPEN", closesAt: { lte: now } },
    select: { id: true },
  });

  let closed = 0;
  for (const { id } of due) {
    const claim = await prisma.votingRound.updateMany({
      where: { id, status: "OPEN", closesAt: { lte: now } },
      data: { status: "CLOSED", closedAt: now },
    });
    if (claim.count !== 1) continue; // another worker closed it
    await freezeResults(prisma, id);
    closed += 1;
  }
  return closed;
}

/**
 * Writes the frozen tally for a closed round. Idempotent: the unique
 * (roundId, proposalId) index means a re-run after a crash inserts nothing new.
 */
export async function freezeResults(prisma: PrismaClient, roundId: string) {
  const round = await prisma.votingRound.findUniqueOrThrow({ where: { id: roundId } });
  const existing = await prisma.votingRoundResult.count({ where: { roundId } });
  if (existing > 0) return existing;

  const proposals = await prisma.voteProposal.findMany({
    where: { roundId },
    include: { _count: { select: { votes: true } } },
  });
  const ranked = rankProposals(
    proposals.map((p) => ({ proposalId: p.id, voteCount: p._count.votes, createdAt: p.createdAt })),
  );

  await prisma.votingRoundResult.createMany({
    data: ranked.map((row) => ({
      roundId,
      proposalId: row.proposalId,
      rank: row.rank,
      voteCount: row.voteCount,
      // A proposal with no votes never wins, even if the round is under-subscribed.
      selected: row.rank <= round.selectionCount && row.voteCount > 0,
    })),
    skipDuplicates: true,
  });
  return ranked.length;
}

/**
 * CLOSED -> FINALIZED: create a pool for every selected proposal.
 *
 * Pool ids are derived from the proposal id, so re-running after a crash upserts
 * the same rows instead of creating duplicates.
 */
export async function finalizeClosedRounds(
  prisma: PrismaClient,
  config: VotingConfig = loadVotingConfig(),
  now = new Date(),
) {
  const closed = await prisma.votingRound.findMany({
    where: { status: "CLOSED" },
    select: { id: true },
  });

  let finalized = 0;
  for (const { id } of closed) {
    // A crash between close and finalize leaves the results unwritten; make sure
    // they exist before selecting from them.
    await freezeResults(prisma, id);
    const created = await createPoolsForRound(prisma, id, config);

    const claim = await prisma.votingRound.updateMany({
      where: { id, status: "CLOSED" },
      data: { status: "FINALIZED", finalizedAt: now },
    });
    if (claim.count === 1) finalized += 1;
    void created;
  }
  return finalized;
}

/** Creates the Veyra-native pool for each selected proposal. Idempotent. */
export async function createPoolsForRound(
  prisma: PrismaClient,
  roundId: string,
  config: VotingConfig = loadVotingConfig(),
) {
  const winners = await prisma.votingRoundResult.findMany({
    where: { roundId, selected: true },
    include: { proposal: true },
    orderBy: { rank: "asc" },
  });

  const marketIds: string[] = [];
  for (const winner of winners) {
    const marketId = poolIdForProposal(winner.proposalId);
    marketIds.push(marketId);
    await withUniqueRetry(() =>
      prisma.market.upsert({
        where: { id: marketId },
        create: {
          id: marketId,
          title: winner.proposal.title,
          category: winner.proposal.category || config.defaultCategory,
          tag: winner.proposal.tag,
          status: "open",
          // Veyra-native: no CLOB tokens, so this never enters the live
          // Polymarket execution path (see resolveBook in betting/service.ts).
          source: VEYRA_POOL_SOURCE,
          resolvesAt: winner.proposal.resolvesAt,
        },
        update: {},
      }),
    );
    // Never reassign a pool once linked.
    await prisma.voteProposal.updateMany({
      where: { id: winner.proposalId, marketId: null },
      data: { marketId },
    });
  }
  return marketIds;
}

/**
 * One tick of the voting lifecycle: close what is due, finish anything closed, then
 * make sure a round is open for the next 24 hours.
 */
export async function runVotingTick(
  prisma: PrismaClient,
  config: VotingConfig = loadVotingConfig(),
  now = new Date(),
) {
  const closed = await closeDueRounds(prisma, now);
  const finalized = await finalizeClosedRounds(prisma, config, now);
  const { created } = await openRound(prisma, config, now);
  return { closed, finalized, opened: created ? 1 : 0 };
}

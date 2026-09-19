import "server-only";

import type { PrismaClient } from "@prisma/client";
import { BettingError } from "@/server/errors";
import { isUniqueViolation, withUniqueRetry } from "@/server/prisma-retry";
import { loadVotingConfig, normalizeTitle, type VotingConfig } from "@/server/voting/config";

export type RoundStatus = "OPEN" | "CLOSED" | "FINALIZED";

/**
 * Opens a round if none is open.
 *
 * Safe to call from any number of workers at once: the `voting_round_single_open`
 * partial unique index means only one INSERT can win, and the losers see P2002 and
 * read back the round the winner created. No lease is needed.
 */
export async function openRound(
  prisma: PrismaClient,
  config: VotingConfig = loadVotingConfig(),
  now = new Date(),
) {
  const existing = await prisma.votingRound.findFirst({ where: { status: "OPEN" } });
  if (existing) return { round: existing, created: false };
  try {
    const round = await prisma.votingRound.create({
      data: {
        status: "OPEN",
        opensAt: now,
        closesAt: new Date(now.getTime() + config.roundMs),
        selectionCount: config.selectionCount,
        votesPerWallet: config.votesPerWallet,
      },
    });
    return { round, created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Another worker opened it first.
    const round = await prisma.votingRound.findFirstOrThrow({ where: { status: "OPEN" } });
    return { round, created: false };
  }
}

export async function getOpenRound(prisma: PrismaClient) {
  return prisma.votingRound.findFirst({ where: { status: "OPEN" } });
}

/**
 * The round a vote or proposal may target: OPEN and not yet past its deadline.
 * Read inside the caller's transaction, after the round row is locked.
 */
function assertAcceptingWrites(
  round: { status: string; closesAt: Date },
  now: Date,
) {
  if (round.status !== "OPEN") {
    throw new BettingError("ROUND_CLOSED", "This voting round has closed.", 409);
  }
  if (round.closesAt.getTime() <= now.getTime()) {
    throw new BettingError("ROUND_CLOSED", "This voting round has closed.", 409);
  }
}

export type ProposalInput = {
  roundId: string;
  title: string;
  category: string;
  tag: string;
  resolvesAt?: string | null;
  proposerWallet: string;
};

export async function submitProposal(
  prisma: PrismaClient,
  input: ProposalInput,
  config: VotingConfig = loadVotingConfig(),
  now = new Date(),
) {
  const normalizedTitle = normalizeTitle(input.title);
  if (!normalizedTitle) throw new BettingError("INVALID_PROPOSAL", "A proposal needs a title.", 400);

  return withUniqueRetry(() =>
    prisma.$transaction(async (tx) => {
      // Lock the round: a close running concurrently must not race with this insert.
      await tx.$queryRaw`SELECT "id" FROM "voting_rounds" WHERE "id" = ${input.roundId} FOR UPDATE`;
      const round = await tx.votingRound.findUniqueOrThrow({ where: { id: input.roundId } });
      assertAcceptingWrites(round, now);

      const mine = await tx.voteProposal.count({
        where: { roundId: input.roundId, proposerWallet: input.proposerWallet },
      });
      if (mine >= config.proposalsPerWallet) {
        throw new BettingError(
          "PROPOSAL_LIMIT",
          `You can propose at most ${config.proposalsPerWallet} questions per round.`,
          429,
        );
      }

      const duplicate = await tx.voteProposal.findUnique({
        where: { roundId_normalizedTitle: { roundId: input.roundId, normalizedTitle } },
      });
      if (duplicate) {
        throw new BettingError("DUPLICATE_PROPOSAL", "That question has already been proposed this round.", 409);
      }

      return tx.voteProposal.create({
        data: {
          roundId: input.roundId,
          title: input.title.trim(),
          normalizedTitle,
          category: input.category,
          tag: input.tag,
          resolvesAt: input.resolvesAt ?? null,
          proposerWallet: input.proposerWallet,
        },
      });
    }),
  );
}

export type VoteResult = {
  /** False when this wallet had already voted for this proposal (idempotent replay). */
  recorded: boolean;
  votesUsed: number;
  votesRemaining: number;
};

/**
 * Casts one vote.
 *
 * The per-wallet budget is a count check, which races by nature, so the whole thing
 * runs inside a transaction that locks the round row first: concurrent votes from
 * one wallet serialize behind that lock and the second one sees the first one's
 * count. The unique index on (roundId, walletAddress, proposalId) independently
 * makes a duplicate vote a no-op rather than an error.
 */
export async function castVote(
  prisma: PrismaClient,
  input: { roundId: string; proposalId: string; walletAddress: string },
  now = new Date(),
): Promise<VoteResult> {
  return withUniqueRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "voting_rounds" WHERE "id" = ${input.roundId} FOR UPDATE`;
      const round = await tx.votingRound.findUniqueOrThrow({ where: { id: input.roundId } });
      assertAcceptingWrites(round, now);

      const proposal = await tx.voteProposal.findUnique({ where: { id: input.proposalId } });
      if (!proposal || proposal.roundId !== input.roundId) {
        throw new BettingError("UNKNOWN_PROPOSAL", "That proposal is not part of this round.", 404);
      }

      const existing = await tx.vote.findUnique({
        where: {
          roundId_walletAddress_proposalId: {
            roundId: input.roundId,
            walletAddress: input.walletAddress,
            proposalId: input.proposalId,
          },
        },
      });
      const used = await tx.vote.count({
        where: { roundId: input.roundId, walletAddress: input.walletAddress },
      });
      if (existing) {
        // Replaying a vote is not an error and never consumes a second unit.
        return { recorded: false, votesUsed: used, votesRemaining: Math.max(0, round.votesPerWallet - used) };
      }
      if (used >= round.votesPerWallet) {
        throw new BettingError(
          "VOTE_LIMIT",
          `You have used all ${round.votesPerWallet} of your votes for this round.`,
          429,
        );
      }

      await tx.vote.create({
        data: {
          roundId: input.roundId,
          proposalId: input.proposalId,
          walletAddress: input.walletAddress,
        },
      });
      const votesUsed = used + 1;
      return {
        recorded: true,
        votesUsed,
        votesRemaining: Math.max(0, round.votesPerWallet - votesUsed),
      };
    }),
  );
}

/** Live tally for an OPEN round. Once a round closes, read `voting_round_results`. */
export async function liveTally(prisma: PrismaClient, roundId: string) {
  const proposals = await prisma.voteProposal.findMany({
    where: { roundId },
    include: { _count: { select: { votes: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rankProposals(
    proposals.map((p) => ({
      proposalId: p.id,
      voteCount: p._count.votes,
      createdAt: p.createdAt,
    })),
  );
}

export type RankedProposal = {
  proposalId: string;
  voteCount: number;
  createdAt: Date;
  rank: number;
};

/**
 * Deterministic ranking: votes descending, then the earlier proposal, then id.
 *
 * Ties are broken by submission time so the order never depends on database row
 * order or on when the tally happened to run. The resolved rank is stored with the
 * frozen result, so the tiebreak stays auditable instead of being re-derived.
 */
export function rankProposals(
  rows: { proposalId: string; voteCount: number; createdAt: Date }[],
): RankedProposal[] {
  return [...rows]
    .sort((a, b) => {
      if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
      const byTime = a.createdAt.getTime() - b.createdAt.getTime();
      if (byTime !== 0) return byTime;
      return a.proposalId < b.proposalId ? -1 : a.proposalId > b.proposalId ? 1 : 0;
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

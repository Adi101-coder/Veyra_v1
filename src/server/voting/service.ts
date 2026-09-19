import "server-only";

import { requireWallet } from "@/server/auth";
import { getPrisma } from "@/server/db";
import { BettingError } from "@/server/errors";
import { parseWalletAddress } from "@/server/betting/validation";
import { loadVotingConfig, normalizeCategory } from "@/server/voting/config";
import { castVote, getOpenRound, liveTally, openRound, submitProposal } from "@/server/voting/store";

/** Request-facing wrappers over the voting store. */

const MAX_TITLE = 160;

export function parseProposalBody(body: unknown) {
  const raw = (body ?? {}) as Record<string, unknown>;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) throw new BettingError("INVALID_PROPOSAL", "A proposal needs a title.", 400);
  if (title.length > MAX_TITLE) {
    throw new BettingError("INVALID_PROPOSAL", `Keep the question under ${MAX_TITLE} characters.`, 400);
  }
  // Store a real catalog category so the pool created later is renderable.
  const category = normalizeCategory(typeof raw.category === "string" ? raw.category : undefined);
  const tag = typeof raw.tag === "string" && raw.tag.trim() ? raw.tag.trim() : "community";
  const resolvesAt = typeof raw.resolvesAt === "string" && raw.resolvesAt.trim() ? raw.resolvesAt.trim() : null;
  if (resolvesAt && Number.isNaN(new Date(resolvesAt).getTime())) {
    throw new BettingError("INVALID_PROPOSAL", "resolvesAt must be an ISO timestamp.", 400);
  }
  return { title, category, tag, resolvesAt };
}

export function parseVoteBody(body: unknown) {
  const raw = (body ?? {}) as Record<string, unknown>;
  const proposalId = typeof raw.proposalId === "string" ? raw.proposalId.trim() : "";
  if (!proposalId) throw new BettingError("INVALID_VOTE", "proposalId is required.", 400);
  return { proposalId };
}

/**
 * The round users act on. Read-only: the worker owns the round schedule, so a page
 * load never creates one. Between the last round finalizing and the next tick
 * (at most one worker interval) this returns a null round.
 */
export async function currentRound(walletAddress?: string) {
  const prisma = getPrisma();
  const round = await getOpenRound(prisma);
  if (!round) return { round: null, proposals: [], myVotes: [], votesRemaining: null };
  const proposals = await prisma.voteProposal.findMany({
    where: { roundId: round.id },
    include: { _count: { select: { votes: true } } },
    orderBy: { createdAt: "asc" },
  });
  const ranked = await liveTally(prisma, round.id);
  const rankById = new Map(ranked.map((r) => [r.proposalId, r.rank]));

  const myVotes = walletAddress
    ? await prisma.vote.findMany({
        where: { roundId: round.id, walletAddress },
        select: { proposalId: true },
      })
    : [];

  return {
    round: {
      id: round.id,
      status: round.status,
      opensAt: round.opensAt.toISOString(),
      closesAt: round.closesAt.toISOString(),
      selectionCount: round.selectionCount,
      votesPerWallet: round.votesPerWallet,
    },
    proposals: proposals.map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      tag: p.tag,
      resolvesAt: p.resolvesAt,
      proposerWallet: p.proposerWallet,
      voteCount: p._count.votes,
      rank: rankById.get(p.id) ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
    myVotes: myVotes.map((v) => v.proposalId),
    votesRemaining: walletAddress ? Math.max(0, round.votesPerWallet - myVotes.length) : null,
  };
}

export async function proposeQuestion(request: Request, body: unknown) {
  const wallet = parseWalletAddress(requireWallet(request));
  const prisma = getPrisma();
  const config = loadVotingConfig();
  // A write may open the round if the worker has not ticked yet; the partial
  // unique index keeps that to exactly one round.
  const { round } = await openRound(prisma, config);
  const input = parseProposalBody(body);
  const proposal = await submitProposal(
    prisma,
    { roundId: round.id, ...input, proposerWallet: wallet },
    config,
  );
  return {
    id: proposal.id,
    roundId: proposal.roundId,
    title: proposal.title,
    category: proposal.category,
    tag: proposal.tag,
    resolvesAt: proposal.resolvesAt,
    createdAt: proposal.createdAt.toISOString(),
  };
}

export async function voteForProposal(request: Request, body: unknown) {
  const wallet = parseWalletAddress(requireWallet(request));
  const prisma = getPrisma();
  const { proposalId } = parseVoteBody(body);
  const proposal = await prisma.voteProposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new BettingError("UNKNOWN_PROPOSAL", "That proposal does not exist.", 404);
  return castVote(prisma, { roundId: proposal.roundId, proposalId, walletAddress: wallet });
}

/** Frozen history for a finished round: the audit trail for its selection. */
export async function roundHistory(roundId: string) {
  const prisma = getPrisma();
  const round = await prisma.votingRound.findUnique({ where: { id: roundId } });
  if (!round) throw new BettingError("UNKNOWN_ROUND", "No such voting round.", 404);
  const results = await prisma.votingRoundResult.findMany({
    where: { roundId },
    include: { proposal: true },
    orderBy: { rank: "asc" },
  });
  return {
    round: {
      id: round.id,
      status: round.status,
      opensAt: round.opensAt.toISOString(),
      closesAt: round.closesAt.toISOString(),
      closedAt: round.closedAt?.toISOString() ?? null,
      finalizedAt: round.finalizedAt?.toISOString() ?? null,
      selectionCount: round.selectionCount,
    },
    results: results.map((r) => ({
      rank: r.rank,
      proposalId: r.proposalId,
      title: r.proposal.title,
      voteCount: r.voteCount,
      selected: r.selected,
      marketId: r.proposal.marketId,
    })),
  };
}

export async function listRounds(limit = 30) {
  const prisma = getPrisma();
  const rounds = await prisma.votingRound.findMany({
    orderBy: { opensAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
  return rounds.map((round) => ({
    id: round.id,
    status: round.status,
    opensAt: round.opensAt.toISOString(),
    closesAt: round.closesAt.toISOString(),
    finalizedAt: round.finalizedAt?.toISOString() ?? null,
  }));
}

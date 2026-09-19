import "server-only";

import { categories, type CategoryId } from "@/lib/markets";

/**
 * Daily voting configuration. Values are read once per call so tests can vary them,
 * and every value that affects a round in flight is copied onto the round row when
 * it opens (see `openRound`), so changing config never retroactively changes the
 * rules a voter played by.
 */

export type VotingConfig = {
  /** Length of a voting round. */
  roundMs: number;
  /** How many proposals become pools when a round finalizes. */
  selectionCount: number;
  /** Distinct proposals one wallet may vote for in a round. */
  votesPerWallet: number;
  /** Proposals one wallet may submit per round. */
  proposalsPerWallet: number;
  /** Category assigned to pools created from winning proposals. */
  defaultCategory: string;
};

const int = (raw: string | undefined, fallback: number, min: number, max: number) => {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value) || value < min || value > max) return fallback;
  return value;
};

export function loadVotingConfig(env: NodeJS.ProcessEnv = process.env): VotingConfig {
  return {
    roundMs: int(env.VEYRA_VOTING_ROUND_MS, 24 * 60 * 60 * 1000, 60_000, 7 * 24 * 60 * 60 * 1000),
    selectionCount: int(env.VEYRA_VOTING_SELECTION_COUNT, 5, 1, 50),
    votesPerWallet: int(env.VEYRA_VOTING_VOTES_PER_WALLET, 3, 1, 50),
    proposalsPerWallet: int(env.VEYRA_VOTING_PROPOSALS_PER_WALLET, 3, 1, 50),
    defaultCategory: normalizeCategory(env.VEYRA_VOTING_DEFAULT_CATEGORY),
  };
}

/**
 * Proposal categories must be real catalog categories, otherwise the pool cannot be
 * rendered or coloured. Anything unrecognised falls back to "culture".
 */
export function normalizeCategory(value: string | undefined): Exclude<CategoryId, "all"> {
  const wanted = (value ?? "").trim().toLowerCase();
  const match = categories.find((c) => c.id === wanted && c.id !== "all");
  return (match?.id ?? "culture") as Exclude<CategoryId, "all">;
}

/** Pools created from winning proposals are Veyra-native, not Polymarket-backed. */
export const VEYRA_POOL_SOURCE = "veyra";

/** Deterministic pool id for a winning proposal: finalization can safely re-run. */
export function poolIdForProposal(proposalId: string) {
  return `veyra-${proposalId}`;
}

/**
 * Titles are compared case- and whitespace-insensitively so the same question
 * cannot be proposed twice in a round and split its own vote.
 */
export function normalizeTitle(title: string) {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

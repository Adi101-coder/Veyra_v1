"use client";

import { useState } from "react";
import { categoryLabel, type CategoryId } from "@/lib/markets";
import type { VotingProposal } from "@/lib/betting-api";

function sameWallet(a: string, b: string) {
  if (a.startsWith("0x") || b.startsWith("0x")) return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

function shortWallet(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * The live tally. `rank` comes from the server so everyone sees the same order —
 * re-sorting client-side would disagree with the frozen result once the round
 * closes, since ties are broken by submission time rather than by vote count alone.
 */
export function ProposalList({
  proposals,
  myVotes,
  viewerWallet,
  selectionCount,
  canVote,
  busyId,
  onVote,
  onUnvote,
  onRemove,
}: {
  proposals: VotingProposal[];
  myVotes: string[];
  viewerWallet: string | null;
  selectionCount: number;
  canVote: boolean;
  busyId: string | null;
  onVote: (proposalId: string) => void;
  onUnvote: (proposalId: string) => void;
  onRemove: (proposalId: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (proposals.length === 0) {
    return (
      <p className="mt-6 rounded-[22px] border border-dashed border-[rgba(24,45,74,0.16)] px-5 py-8 text-center text-[14px] text-[#65758b]">
        Nothing proposed yet. Be first — an unopposed question still needs one vote to win.
      </p>
    );
  }

  const ordered = [...proposals].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  return (
    <ul className="mt-6 space-y-2">
      {ordered.map((proposal) => {
        const voted = myVotes.includes(proposal.id);
        const mine = viewerWallet != null && sameWallet(proposal.proposerWallet, viewerWallet);
        const confirming = confirmId === proposal.id;
        const voting = busyId === `vote:${proposal.id}`;
        const removing = busyId === `remove:${proposal.id}`;
        // A proposal with no votes never wins, even inside the cut line.
        const winning = proposal.rank != null && proposal.rank <= selectionCount && proposal.voteCount > 0;
        return (
          <li
            key={proposal.id}
            className={`flex flex-wrap items-center gap-4 rounded-[18px] border bg-white px-5 py-4 ${
              winning ? "border-[rgba(24,45,74,0.22)]" : "border-[rgba(24,45,74,0.08)]"
            }`}
          >
            <div className="w-8 shrink-0 text-center">
              <p className="font-serif text-[18px] tracking-[-0.02em] text-[#182d4a] tabular-nums">
                {proposal.rank ?? "—"}
              </p>
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate font-serif text-[17px] leading-tight text-[#182d4a]">
                {proposal.title}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#657da0]">
                {categoryLabel(proposal.category as Exclude<CategoryId, "all">)}
                {mine ? " · you proposed this" : ` · ${shortWallet(proposal.proposerWallet)}`}
                {winning ? <span className="text-[#3d7d5c]"> · opening as a pool</span> : null}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="font-serif text-[20px] tracking-[-0.02em] text-[#182d4a] tabular-nums">
                {proposal.voteCount}
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#657da0]">
                {proposal.voteCount === 1 ? "vote" : "votes"}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {mine ? (
                <button
                  type="button"
                  disabled={removing || voting}
                  onClick={() => {
                    if (!confirming) {
                      setConfirmId(proposal.id);
                      return;
                    }
                    setConfirmId(null);
                    onRemove(proposal.id);
                  }}
                  className={`rounded-full border px-4 py-1.5 font-serif text-[14px] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    confirming
                      ? "border-[#ad4c62] bg-[#ad4c62] text-white"
                      : "border-[rgba(24,45,74,0.14)] text-[#65758b] hover:border-[#ad4c62] hover:text-[#ad4c62]"
                  }`}
                >
                  {removing ? "…" : confirming ? "Confirm remove" : "Remove"}
                </button>
              ) : null}
              {confirming ? (
                <button
                  type="button"
                  onClick={() => setConfirmId(null)}
                  className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#657da0]"
                >
                  Cancel
                </button>
              ) : voted ? (
                <button
                  type="button"
                  disabled={voting || removing}
                  onClick={() => onUnvote(proposal.id)}
                  className="shrink-0 rounded-full border border-[rgba(24,45,74,0.14)] px-4 py-1.5 font-serif text-[14px] text-[#65758b] transition hover:border-[#182d4a] hover:text-[#182d4a] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {voting ? "…" : "Undo vote"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!canVote || voting || removing}
                  onClick={() => onVote(proposal.id)}
                  className="shrink-0 rounded-full border border-[#265bff] px-4 py-1.5 font-serif text-[14px] text-[#182d4a] transition hover:bg-[#1847d8] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {voting ? "…" : "Vote"}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

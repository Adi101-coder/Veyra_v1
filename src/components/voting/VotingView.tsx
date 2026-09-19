"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { useWallet } from "@/components/wallet/WalletProvider";
import { describeBettingError } from "@/lib/betting";
import { castVote, getVotingRound, proposeQuestion, type VotingRound } from "@/lib/betting-api";
import { ProposalForm } from "@/components/voting/ProposalForm";
import { ProposalList } from "@/components/voting/ProposalList";
import { Countdown } from "@/components/voting/Countdown";

const labelClass = "font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]";

/**
 * The daily voting round.
 *
 * Reads are public so a signed-out visitor can see what is being voted on; casting
 * and proposing need a wallet. The round's own rules (`votesPerWallet`,
 * `selectionCount`) come from the server rather than being hardcoded, because they
 * are frozen per round — a round in flight keeps the rules it opened under.
 */
export function VotingView() {
  const { address, hasSession } = useWallet();
  const [data, setData] = useState<VotingRound | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getVotingRound());
      setError(null);
    } catch (err) {
      setError(describeBettingError(err, "Could not load the voting round."));
    }
  }, []);

  useEffect(() => {
    void load();
    // The worker opens and closes rounds, so poll rather than assume this page
    // knows when the state changed.
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load, address]);

  const onVote = async (proposalId: string) => {
    setBusy(proposalId);
    setNotice(null);
    try {
      const result = await castVote(proposalId);
      setNotice(
        result.recorded
          ? `Vote counted. ${result.votesRemaining} left this round.`
          : "You had already voted for that one.",
      );
      await load();
    } catch (err) {
      setNotice(describeBettingError(err, "Could not record that vote."));
    } finally {
      setBusy(null);
    }
  };

  const onPropose = async (input: { title: string; category: string }) => {
    const proposal = await proposeQuestion(input);
    await load();
    return proposal;
  };

  const round = data?.round ?? null;
  const proposals = data?.proposals ?? [];
  const votesRemaining = data?.votesRemaining ?? null;
  const canAct = Boolean(address && hasSession);

  return (
    <div className="bg-[#f4f2ed]">
      <Shell className="max-w-3xl pt-8 pb-20">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c45c5c]">Daily vote</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-[36px] leading-none tracking-[-0.03em] text-[#1a1a1a] sm:text-[42px]">
              What should Veyra ask?
            </h1>
            <p className="mt-3 max-w-[34rem] text-[15px] leading-6 text-[#6e6e6e] italic">
              {round
                ? `Propose a question or back one you want settled. The top ${round.selectionCount} open as Veyra pools when the round closes.`
                : "Rounds run every 24 hours."}
            </p>
          </div>
          {round ? <Countdown closesAt={round.closesAt} /> : null}
        </div>

        {error ? (
          <p className="mt-8 rounded-[18px] border border-[#e0cccc] bg-[#fbf5f5] px-5 py-4 font-mono text-[12px] text-[#a34a4a]">
            {error}
          </p>
        ) : null}

        {!error && !round ? (
          <p className="mt-8 rounded-[18px] border border-[rgba(26,26,26,0.08)] bg-white px-5 py-5 text-[14px] leading-6 text-[#6e6e6e]">
            No round is open right now. The next one opens within a minute or two —
            this page will pick it up on its own.
          </p>
        ) : null}

        {round ? (
          <>
            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-[22px] border border-[rgba(26,26,26,0.08)] bg-white px-5 py-4">
              <div>
                <p className={labelClass}>Proposals</p>
                <p className="mt-1 font-serif text-[20px] tracking-[-0.03em] text-[#1a1a1a]">
                  {proposals.length}
                </p>
              </div>
              <div>
                <p className={labelClass}>Pools opening</p>
                <p className="mt-1 font-serif text-[20px] tracking-[-0.03em] text-[#1a1a1a]">
                  {round.selectionCount}
                </p>
              </div>
              <div>
                <p className={labelClass}>Your votes left</p>
                <p className="mt-1 font-serif text-[20px] tracking-[-0.03em] text-[#1a1a1a]">
                  {canAct ? `${votesRemaining ?? round.votesPerWallet} / ${round.votesPerWallet}` : "—"}
                </p>
              </div>
            </div>

            {notice ? (
              <p className="mt-4 font-mono text-[11px] text-[#6a6a6a]">{notice}</p>
            ) : null}

            {canAct ? (
              <ProposalForm onSubmit={onPropose} />
            ) : (
              <p className="mt-6 rounded-[18px] border border-[rgba(26,26,26,0.08)] bg-white px-5 py-4 text-[14px] leading-6 text-[#6e6e6e]">
                Connect a wallet to propose a question or vote. One signature, no gas.
              </p>
            )}

            <ProposalList
              proposals={proposals}
              myVotes={data?.myVotes ?? []}
              selectionCount={round.selectionCount}
              canVote={canAct && (votesRemaining ?? 0) > 0}
              busyId={busy}
              onVote={onVote}
            />
          </>
        ) : null}

        <p className="mt-10 font-mono text-[11px] leading-relaxed text-[#8a8a8a]">
          When a round closes the result is frozen — later votes cannot change it. Ties
          go to whichever question was proposed first.{" "}
          <Link href="/markets" className="underline">
            See the pools already open
          </Link>
          .
        </p>
      </Shell>
    </div>
  );
}

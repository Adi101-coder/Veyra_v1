"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { useWallet } from "@/components/wallet/WalletProvider";
import { describeBettingError } from "@/lib/betting";
import {
  castVote,
  getVotingRound,
  proposeQuestion,
  retractVote,
  withdrawProposal,
  type VotingRound,
} from "@/lib/betting-api";
import { ProposalForm } from "@/components/voting/ProposalForm";
import { ProposalList } from "@/components/voting/ProposalList";
import { Countdown } from "@/components/voting/Countdown";

const labelClass = "font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b]";

/**
 * The daily voting round.
 *
 * Reads are public so a signed-out visitor can see what is being voted on; casting
 * and proposing need a wallet. The round's own rules (`votesPerWallet`,
 * `selectionCount`) come from the server rather than being hardcoded, because they
 * are frozen per round — a round in flight keeps the rules it opened under.
 */
export function VotingView() {
  const { address, hasSession, sessionChecked, signingIn, signIn, signInError } = useWallet();
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
    setBusy(`vote:${proposalId}`);
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

  const onUnvote = async (proposalId: string) => {
    setBusy(`vote:${proposalId}`);
    setNotice(null);
    try {
      const result = await retractVote(proposalId);
      setNotice(
        result.removed
          ? `Vote removed. ${result.votesRemaining} left this round.`
          : "That vote was already gone.",
      );
      await load();
    } catch (err) {
      setNotice(describeBettingError(err, "Could not remove that vote."));
    } finally {
      setBusy(null);
    }
  };

  const onRemove = async (proposalId: string) => {
    setBusy(`remove:${proposalId}`);
    setNotice(null);
    try {
      const result = await withdrawProposal(proposalId);
      setNotice(
        result.votesReleased > 0
          ? "Question removed. Votes on it were released."
          : "Question removed.",
      );
      await load();
    } catch (err) {
      setNotice(describeBettingError(err, "Could not remove that question."));
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
    <div className="bg-[#f1f6ff]">
      <Shell className="max-w-3xl pt-8 pb-20">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#265bff]">Daily vote</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-[28px] leading-tight tracking-[-0.03em] text-[#182d4a] sm:text-[42px]">
              What should Split ask?
            </h1>
            <p className="mt-3 max-w-[34rem] text-[15px] leading-6 text-[#65758b] italic">
              {round
                ? `Propose a question or back one you want settled. The top ${round.selectionCount} open as Split pools when the round closes.`
                : "Rounds run every 24 hours."}
            </p>
          </div>
          {round ? <Countdown closesAt={round.closesAt} /> : null}
        </div>

        {error ? (
          <p className="mt-8 rounded-[18px] border border-[#e0cccc] bg-[#ffeff0] px-5 py-4 font-mono text-[12px] text-[#ad4c62]">
            {error}
          </p>
        ) : null}

        {!error && !round ? (
          <p className="mt-8 rounded-[18px] border border-[rgba(24,45,74,0.08)] bg-white px-5 py-5 text-[14px] leading-6 text-[#65758b]">
            No round is open right now. The next one opens within a minute or two —
            this page will pick it up on its own.
          </p>
        ) : null}

        {round ? (
          <>
            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-[22px] border border-[rgba(24,45,74,0.08)] bg-white px-5 py-4">
              <div>
                <p className={labelClass}>Proposals</p>
                <p className="mt-1 font-serif text-[20px] tracking-[-0.03em] text-[#182d4a]">
                  {proposals.length}
                </p>
              </div>
              <div>
                <p className={labelClass}>Pools opening</p>
                <p className="mt-1 font-serif text-[20px] tracking-[-0.03em] text-[#182d4a]">
                  {round.selectionCount}
                </p>
              </div>
              <div>
                <p className={labelClass}>Your votes left</p>
                <p className="mt-1 font-serif text-[20px] tracking-[-0.03em] text-[#182d4a]">
                  {canAct ? `${votesRemaining ?? round.votesPerWallet} / ${round.votesPerWallet}` : "—"}
                </p>
              </div>
            </div>

            {notice ? (
              <p className="mt-4 font-mono text-[11px] text-[#65758b]">{notice}</p>
            ) : null}

            {canAct ? (
              <ProposalForm onSubmit={onPropose} />
            ) : !address ? (
              <div className="mt-6 rounded-[18px] border border-[rgba(24,45,74,0.08)] bg-white px-5 py-4">
                <p className="text-[14px] leading-6 text-[#65758b]">
                  Connect a wallet to propose a question or vote. One signature, no gas.
                </p>
                <div className="mt-4">
                  <ConnectWalletButton />
                </div>
              </div>
            ) : !sessionChecked ? (
              <p className="mt-6 text-[14px] leading-6 text-[#65758b]">Checking whether this wallet is signed in…</p>
            ) : (
              <div className="mt-6 rounded-[18px] border border-[rgba(24,45,74,0.08)] bg-white px-5 py-4">
                <p className="text-[14px] leading-6 text-[#65758b]">
                  Sign in with this wallet to propose or vote. One signature, no gas.
                </p>
                <button
                  type="button"
                  disabled={signingIn}
                  onClick={() => {
                    void signIn().catch(() => undefined);
                  }}
                  className="mt-4 rounded-full bg-[#265bff] px-5 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-white disabled:opacity-60"
                >
                  {signingIn ? "Confirm in wallet…" : "Sign in"}
                </button>
                {signInError ? <p className="mt-3 font-mono text-[12px] text-[#ad4c62]">{signInError}</p> : null}
              </div>
            )}

            <ProposalList
              proposals={proposals}
              myVotes={data?.myVotes ?? []}
              viewerWallet={address}
              selectionCount={round.selectionCount}
              canVote={canAct && (votesRemaining ?? 0) > 0}
              busyId={busy}
              onVote={onVote}
              onUnvote={onUnvote}
              onRemove={onRemove}
            />
          </>
        ) : null}

        <p className="mt-10 font-mono text-[11px] leading-relaxed text-[#65758b]">
          While the round is open you can remove a question you proposed, or take a vote
          back. When it closes the result is frozen — later votes cannot change it. Ties
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

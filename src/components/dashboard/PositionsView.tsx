"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { useWallet } from "@/components/wallet/WalletProvider";
import { describeBettingError, type PredictionDTO } from "@/lib/betting";
import { closePosition, getBestBid, listUserPredictions } from "@/lib/betting-api";
import { shortenAddress } from "@/lib/solana-wallet";

const POLL_MS = 10_000;
const labelClass = "font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b]";
const OPEN_STATUSES = new Set(["filled", "partial", "closed", "adjusting"]);

type Exit = { percent?: number; shares?: string };

const usd = (value: number) => `$${value.toFixed(2)}`;

function isOpen(prediction: PredictionDTO) {
  const position = prediction.position;
  return Boolean(position && OPEN_STATUSES.has(position.status) && Number(position.shares) > 0 && !prediction.marketResolution);
}

function wagerHref(prediction: PredictionDTO) {
  return `/contract/${encodeURIComponent(prediction.marketId)}/wager/${encodeURIComponent(prediction.id)}`;
}

function historyStatus(prediction: PredictionDTO) {
  if (prediction.score) {
    return prediction.score.correct ? `Won · paid ${usd(Number(prediction.score.payoutUsd))}` : "Lost";
  }
  if (prediction.marketResolution) return `Resolved ${prediction.marketResolution.outcome}`;
  const position = prediction.position;
  if (position?.status === "closed") return "Closed";
  if (position?.status === "failed" || prediction.execution?.status === "failed") {
    return `Order failed${prediction.execution?.errorMessage ? `: ${prediction.execution.errorMessage}` : ""}`;
  }
  return position?.status ?? prediction.status;
}

function PositionCard({ prediction, onChanged }: { prediction: PredictionDTO; onChanged: () => void }) {
  const position = prediction.position!;
  const shares = Number(position.shares);
  const cost = Number(position.notionalUsd);
  const [bid, setBid] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  // One idempotency key per (amount, size held): a retry of the same click reuses it.
  const keys = useRef(new Map<string, string>());

  useEffect(() => {
    let cancelled = false;
    getBestBid(prediction.marketId, prediction.outcome)
      .then((value) => {
        if (!cancelled) setBid(value);
      })
      .catch(() => {
        if (!cancelled) setBid(null);
      });
    return () => {
      cancelled = true;
    };
  }, [prediction.marketId, prediction.outcome, position.shares]);

  const worth = bid != null ? shares * bid : null;
  const pnl = worth != null ? worth - cost : null;

  const sell = async (exit: Exit, label: string) => {
    if (busy) return;
    const intent = `${label}:${position.shares}`;
    const key = keys.current.get(intent) ?? crypto.randomUUID();
    keys.current.set(intent, key);
    setBusy(true);
    setMessage(null);
    try {
      const result = await closePosition(prediction.id, key, exit);
      keys.current.delete(intent);
      const sold = result.history.deltaShares.replace("-", "");
      const left = Number(result.prediction.position?.shares ?? 0);
      setMessage(
        result.history.status === "failed"
          ? `Sell failed: ${result.history.errorMessage ?? "not filled"}. Nothing changed.`
          : left > 0
            ? `Sold ${sold} sh. ${left.toFixed(2)} sh still open. Proceeds are back in your balance.`
            : `Closed. Sold ${sold} sh. Proceeds are back in your balance.`,
      );
      setCustom("");
      onChanged();
    } catch (error) {
      setMessage(describeBettingError(error, "Could not sell."));
    } finally {
      setBusy(false);
      setConfirmAll(false);
    }
  };

  const chip = "rounded-full border px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] disabled:opacity-40";

  return (
    <li className="rounded-[22px] border border-[rgba(24,45,74,0.1)] bg-white px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link href={wagerHref(prediction)} className="max-w-[30rem] font-serif text-[20px] leading-6 tracking-[-0.02em] text-[#182d4a] hover:underline">
          {prediction.marketTitle}
        </Link>
        <span className={`rounded-full px-3 py-1 font-mono text-[11px] tracking-[0.12em] ${prediction.outcome === "YES" ? "bg-[#e8f0ff] text-[#265bff]" : "bg-[#ffeff0] text-[#ad4c62]"}`}>
          {prediction.outcome}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <div>
          <dt className={labelClass}>Shares</dt>
          <dd className="mt-1 font-mono text-[15px] text-[#182d4a]">{shares.toFixed(2)}</dd>
        </div>
        <div>
          <dt className={labelClass}>Paid</dt>
          <dd className="mt-1 font-mono text-[15px] text-[#182d4a]">
            {usd(cost)} <span className="text-[11px] text-[#65758b]">@ {Number(position.avgPrice).toFixed(3)}</span>
          </dd>
        </div>
        <div>
          <dt className={labelClass}>Sell now</dt>
          <dd className="mt-1 font-mono text-[15px] text-[#182d4a]">
            {bid === undefined ? "…" : bid == null || worth == null ? "no buyers" : (
              <>
                {usd(worth)} <span className="text-[11px] text-[#65758b]">@ {bid.toFixed(3)}</span>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className={labelClass}>Profit / loss</dt>
          <dd className={`mt-1 font-mono text-[15px] ${pnl == null ? "text-[#65758b]" : pnl >= 0 ? "text-[#1f7a4d]" : "text-[#ad4c62]"}`}>
            {pnl == null ? "—" : `${pnl >= 0 ? "+" : "−"}${usd(Math.abs(pnl))}`}
          </dd>
        </div>
      </dl>
      <p className="mt-2 font-mono text-[11px] text-[#65758b]">
        Confidence {Math.round(prediction.confidencePct)}% · stake {usd(Number(prediction.stakeUsd))}
        {position.status === "adjusting" ? " · a sell is in progress" : ""}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => void sell({ percent: 25 }, "25")} className={`${chip} border-[rgba(24,45,74,0.14)] bg-white text-[#182d4a]`}>
          Sell 25%
        </button>
        <button type="button" disabled={busy} onClick={() => void sell({ percent: 50 }, "50")} className={`${chip} border-[rgba(24,45,74,0.14)] bg-white text-[#182d4a]`}>
          Sell 50%
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => (confirmAll ? void sell({}, "all") : setConfirmAll(true))}
          onBlur={() => setConfirmAll(false)}
          className={`${chip} border-[#ad4c62] ${confirmAll ? "bg-[#ad4c62] text-white" : "bg-white text-[#ad4c62]"}`}
        >
          {busy ? "Selling…" : confirmAll ? `Confirm: sell all ${shares.toFixed(2)} sh` : "Close all"}
        </button>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = Number(custom);
            if (!Number.isFinite(value) || value <= 0) {
              setMessage("Enter how many shares to sell.");
              return;
            }
            void sell({ shares: custom.trim() }, `sh:${custom.trim()}`);
          }}
        >
          <input
            inputMode="decimal"
            placeholder="shares"
            value={custom}
            disabled={busy}
            onChange={(event) => setCustom(event.target.value)}
            className="w-24 rounded-full border border-[rgba(24,45,74,0.14)] px-3.5 py-2 font-mono text-[12px] text-[#182d4a] outline-none focus:border-[#265bff]"
          />
          <button type="submit" disabled={busy || !custom} className={`${chip} border-[#265bff] bg-[#265bff] text-white`}>
            Sell
          </button>
        </form>
      </div>
      {message ? (
        <p role="status" aria-live="polite" className="mt-3 text-[13px] text-[#536780]">
          {message}
        </p>
      ) : null}
    </li>
  );
}

export function PositionsView() {
  const { address } = useWallet();
  const [predictions, setPredictions] = useState<PredictionDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const run = () =>
      listUserPredictions(address)
        .then((result) => {
          if (cancelled) return;
          setPredictions(result.predictions);
          setError(null);
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(describeBettingError(err, "Could not load your positions."));
        });
    void run();
    const timer = window.setInterval(() => void run(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [address, refresh]);

  const open = (predictions ?? []).filter(isOpen);
  const history = (predictions ?? []).filter((prediction) => !isOpen(prediction));

  return (
    <div className="bg-[#f1f6ff]">
      <Shell className="max-w-3xl pt-8 pb-20">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#ad4c62]">Your bets</p>
        <h1 className="mt-3 font-serif text-[32px] leading-tight tracking-[-0.03em] text-[#182d4a] sm:text-[42px]">
          Positions.
        </h1>
        <p className="mt-3 max-w-[34rem] text-[15px] leading-6 text-[#65758b] italic">
          Every bet you hold. Sell part of one or close it at the current best bid; the
          proceeds go straight back to your balance.
        </p>

        {!address ? (
          <p className="mt-8 text-[15px] text-[#65758b]">Connect the wallet you bet with to see your positions.</p>
        ) : (
          <>
            <p className="mt-2 font-mono text-[11px] text-[#657da0]">{shortenAddress(address, 6)}</p>
            {error ? (
              <p className="mt-8 rounded-[18px] border border-[#e0cccc] bg-[#ffeff0] px-5 py-4 font-mono text-[12px] text-[#ad4c62]">
                {error}
              </p>
            ) : null}

            <section className="mt-8">
              <p className={labelClass}>Open · {predictions ? open.length : "…"}</p>
              {predictions && open.length === 0 ? (
                <p className="mt-3 text-[14px] text-[#65758b]">
                  No open positions. <Link href="/markets" className="text-[#265bff] hover:underline">Find a market</Link>.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {open.map((prediction) => (
                    <PositionCard key={prediction.id} prediction={prediction} onChanged={reload} />
                  ))}
                </ul>
              )}
            </section>

            {history.length > 0 ? (
              <section className="mt-10">
                <p className={labelClass}>History · {history.length}</p>
                <ul className="mt-3 divide-y divide-[rgba(24,45,74,0.08)] rounded-[22px] border border-[rgba(24,45,74,0.1)] bg-white/70">
                  {history.map((prediction) => (
                    <li key={prediction.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3">
                      <Link href={wagerHref(prediction)} className="max-w-[26rem] truncate text-[14px] text-[#182d4a] hover:underline">
                        {prediction.marketTitle}
                      </Link>
                      <span className="font-mono text-[11px] text-[#65758b]">
                        {prediction.outcome} · {usd(Number(prediction.stakeUsd))} · {historyStatus(prediction)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </Shell>
    </div>
  );
}

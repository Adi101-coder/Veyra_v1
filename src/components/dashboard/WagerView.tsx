"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Identicon } from "@/components/dashboard/Identicon";
import { Shell } from "@/components/Shell";
import { useWallet } from "@/components/wallet/WalletProvider";
import { StatusChip } from "@/components/status/StatusChip";
import { WalletSignatureNote } from "@/components/status/WalletSignatureNote";
import {
  describeBettingError,
  describeQuoteRejection,
  hasFilledShares,
  predictionToWagerRow,
  type ConfidenceHistoryDTO,
  type EngineQuote,
  type PredictionDTO,
} from "@/lib/betting";
import {
  changeConfidence,
  getPrediction,
  listConfidenceHistory,
  quotePrediction,
  syncExecution,
} from "@/lib/betting-api";
import {
  categoryColor,
  categoryLabel,
  formatResolvesParts,
  shortenKey,
  type Market,
  type SeatNote,
  type WagerRow,
} from "@/lib/markets";
import { brier, usd } from "@/components/reputation/format";

const CONFIDENCE_PRESETS = [60, 70, 80, 90];

const POLL_MS = 5000;
const CHANGEABLE_POSITION_STATUSES = new Set(["filled", "partial", "closed"]);

function needsReconcile(prediction: PredictionDTO) {
  const execution = prediction.execution?.status;
  const position = prediction.position?.status;
  return (
    execution === "created" ||
    execution === "submitted" ||
    position === "pending" ||
    position === "adjusting"
  );
}

function createdParts(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { date: "—", time: "" };
  return {
    date: date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
    time: `${date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    })} UTC`,
  };
}

function seatStatusLabel(prediction: PredictionDTO | undefined, note: SeatNote) {
  if (!prediction || note !== "OPEN") return noteLabel(note);
  const status = prediction.execution?.status ?? prediction.position?.status ?? prediction.status;
  if (status === "failed" || status === "rejected" || prediction.position?.status === "failed") {
    return "Order failed";
  }
  if (hasFilledShares(prediction)) return noteLabel(note);
  return "Awaiting fill";
}

function noteLabel(note: SeatNote) {
  if (note === "LANDED") return "Judgment: Landed";
  if (note === "MISSED") return "Judgment: Missed";
  if (note === "PUSH") return "Judgment: Push";
  if (note === "OPEN") return "Open seat";
  return "Locked";
}

function noteClass(note: SeatNote) {
  if (note === "LANDED") return "text-[#2f9e6e]";
  if (note === "MISSED") return "text-[#c45c6a]";
  if (note === "PUSH") return "text-[#d08a4a]";
  return "text-[#8a8a8a]";
}

export function WagerView({
  market,
  wager: initialWager,
  prediction: initialPrediction,
}: {
  market: Market;
  wager: WagerRow;
  prediction?: PredictionDTO;
}) {
  const [copied, setCopied] = useState(false);
  const [prediction, setPrediction] = useState(initialPrediction);
  const { address: walletAddress } = useWallet();
  const wager = prediction ? predictionToWagerRow(prediction, shortenKey) : initialWager;
  const color = categoryColor(market.category);
  const created = prediction ? createdParts(prediction.createdAt) : { date: "—", time: "" };
  const resolves = formatResolvesParts(market.resolvesAt);
  const costUsd = prediction?.position?.notionalUsd ?? null;
  const payoutUsd = prediction?.position?.payoutUsd ?? null;
  const creator =
    wager.right.wallet !== "Open seat" ? wager.right : wager.left;
  const shares = prediction?.position?.shares ?? "—";
  const orderId = prediction?.execution?.polymarketOrderId ?? null;
  const executionId = prediction?.execution?.id ?? null;
  const predictionId = prediction?.id ?? null;
  const pollOwner = prediction ? walletsMatch(walletAddress, prediction.walletAddress) : false;
  const reconciling = prediction ? needsReconcile(prediction) : false;

  // Refresh execution status until it reaches a terminal state.
  useEffect(() => {
    if (!predictionId || !reconciling) return;
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      let next: PredictionDTO | null = null;
      if (executionId && pollOwner) {
        try {
          next = await syncExecution(executionId);
        } catch {
          next = null;
        }
      }
      if (!next) {
        try {
          next = await getPrediction(predictionId);
        } catch {
          next = null;
        }
      }
      if (cancelled) return;
      if (next) setPrediction(next);
      if (!next || needsReconcile(next)) timer = window.setTimeout(() => void tick(), POLL_MS);
    };
    timer = window.setTimeout(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [predictionId, executionId, pollOwner, reconciling]);

  const share = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="bg-[#eceae4]">
      <Shell className="pt-4 pb-20 sm:pt-6">
        <p className="mb-6 flex flex-wrap items-center gap-2 font-serif text-[13px] text-[#8a8a8a]">
          <Link href="/dashboard" className="text-[#5a5a5a] no-underline hover:text-[#1a1a1a]">
            ← Dashboard
          </Link>
          <span>/</span>
          <Link
            href={`/contract/${market.id}`}
            className="text-[#5a5a5a] no-underline hover:text-[#1a1a1a]"
          >
            Contract
          </Link>
          <span>/</span>
          <span className="text-[#1a1a1a]">Wager</span>
        </p>

        <section className="rounded-[22px] border border-[rgba(26,26,26,0.06)] bg-[#f7f5f0] px-5 py-6 sm:px-8 sm:py-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#6e6e6e]">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: color }}
              />
              {categoryLabel(market.category)}
              <span className="text-[#b0b0b0]">#{market.tag}</span>
            </p>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[rgba(26,26,26,0.12)] bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#6e6e6e]">
                Public
              </span>
              <button
                type="button"
                onClick={share}
                className="rounded-full border border-[rgba(26,26,26,0.12)] bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#6e6e6e] hover:text-[#1a1a1a]"
              >
                {copied ? "Copied" : "‹ Share"}
              </button>
            </div>
          </div>

          <h1 className="mt-4 max-w-[38rem] font-serif text-[30px] leading-[1.15] tracking-[-0.03em] text-[#1a1a1a] sm:text-[36px]">
            {market.title}
          </h1>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <div className="flex flex-wrap items-center gap-8">
              <div className="flex items-center gap-2.5">
                <Identicon seed={creator.avatar} className="h-8 w-8" />
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9a9a9a]">
                    Creator
                  </p>
                  <p className="font-mono text-[12px] text-[#1a1a1a]">
                    {creator.wallet === "Open seat"
                      ? "Open seat"
                      : shortenKey(creator.wallet, 4, 4)}
                  </p>
                </div>
              </div>
              <Meta label="Stake" value={wager.stake} />
              <Meta label="Shares" value={shares} />
              <Meta
                label="Order"
                value={
                  orderId ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {shortenKey(orderId, 4, 4)}
                      {prediction?.execution?.status ? (
                        <StatusChip kind="execution" status={prediction.execution.status} />
                      ) : null}
                    </span>
                  ) : prediction?.execution?.status ? (
                    <StatusChip kind="execution" status={prediction.execution.status} />
                  ) : prediction?.status ? (
                    <StatusChip kind="order" status={prediction.status} />
                  ) : (
                    "—"
                  )
                }
              />
              {prediction?.settlement ? <SettlementMeta settlement={prediction.settlement} /> : null}
            </div>
            <Link
              href={`/contract/${market.id}`}
              className="rounded-full border border-[rgba(26,26,26,0.12)] bg-white px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a] no-underline hover:text-[#1a1a1a]"
            >
              Close wager
            </Link>
          </div>
        </section>

        <section className="mt-4 rounded-[22px] border border-[rgba(26,26,26,0.06)] bg-[#f7f5f0] px-5 py-7 sm:px-8 sm:py-10">
          <div className="text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">
              Resolution status
            </p>
            <span
              className={`mt-3 inline-flex items-center gap-2 rounded-full border border-[rgba(26,26,26,0.1)] bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${
                prediction?.score
                  ? prediction.score.correct
                    ? "text-[#2f9e6e]"
                    : "text-[#c45c6a]"
                  : "text-[#5a5a5a]"
              }`}
            >
              {prediction?.score
                ? prediction.score.correct
                  ? "Landed"
                  : "Missed"
                : wager.resolution === "PENDING"
                  ? "Pending"
                  : prediction?.marketResolution?.outcome === "INVALID"
                    ? "Voided"
                    : "Resolved"}
              <ClockIcon />
            </span>
            {prediction?.score ? (
              <p className="mt-3 font-mono text-[11px] text-[#8a8a8a]">
                Brier {brier(prediction.score.brierScore)}
                <span className="text-[#c8c4bc]"> · </span>
                <span className={prediction.score.pnlUsd.startsWith("-") ? "text-[#c45c6a]" : "text-[#1a1a1a]"}>
                  PnL {usd(prediction.score.pnlUsd, true)}
                </span>
                <span className="text-[#c8c4bc]"> · </span>
                Payout {usd(prediction.score.payoutUsd)}
                <span className="text-[#c8c4bc]"> · </span>
                Scored at {Math.round(prediction.score.confidencePct)}%
              </p>
            ) : null}
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 sm:gap-0">
            <SeatPanel seat={wager.left} align="left" label={seatStatusLabel(prediction, wager.left.note)} />
            <SeatPanel seat={wager.right} align="right" label={seatStatusLabel(prediction, wager.right.note)} />
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <RiskMeter label="Cost" value={costUsd} max={payoutUsd} side="left" />
            <RiskMeter label="Max payout" value={payoutUsd} max={payoutUsd} side="right" />
          </div>

          <div className="mt-10 grid gap-6 border-t border-[rgba(26,26,26,0.08)] pt-6 sm:grid-cols-2">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9a9a9a]">
                Created at
              </p>
              <p className="mt-2 font-serif text-[18px] tracking-[-0.02em] text-[#1a1a1a]">
                {created.date}
              </p>
              <p className="font-mono text-[11px] text-[#8a8a8a]">{created.time}</p>
            </div>
            <div className="sm:text-right">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9a9a9a]">
                Resolves by
              </p>
              <p className="mt-2 font-serif text-[18px] tracking-[-0.02em] text-[#1a1a1a]">
                {resolves.date}
              </p>
              <p className="font-mono text-[11px] text-[#8a8a8a]">{resolves.time}</p>
            </div>
          </div>

          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9a9a9a]">
                Outcome type
              </p>
              <p className="mt-2 font-serif text-[22px] tracking-[-0.03em] text-[#1a1a1a]">
                Binary
              </p>
            </div>
            <div className="sm:text-right">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9a9a9a]">
                Resolution
              </p>
              <p className="mt-2 font-serif text-[22px] tracking-[-0.03em] text-[#1a1a1a]">
                Peer consensus
              </p>
            </div>
          </div>

          {prediction ? (
            <ChangeMindPanel prediction={prediction} onUpdated={setPrediction} />
          ) : null}
        </section>
      </Shell>
    </div>
  );
}

/** Robinhood Chain settlement reference; only a confirmed receipt reads as settled. */
function SettlementMeta({ settlement }: { settlement: NonNullable<PredictionDTO["settlement"]> }) {
  const label = <StatusChip kind="settlement" status={settlement.status} />;
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9a9a9a]">Robinhood Chain</p>
      <p className="mt-1 font-mono text-[12px] text-[#1a1a1a]">
        {settlement.txHash && settlement.explorerUrl ? (
          <a href={settlement.explorerUrl} target="_blank" rel="noreferrer" className="underline decoration-[#c9c4b8]">
            <span className="inline-flex flex-wrap items-center gap-2">
              {label} {shortenKey(settlement.txHash, 4, 4)}
            </span>
          </a>
        ) : (
          label
        )}
      </p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9a9a9a]">{label}</p>
      <p className="mt-1 font-mono text-[12px] text-[#1a1a1a]">{value}</p>
    </div>
  );
}

function SeatPanel({
  seat,
  align,
  label,
}: {
  seat: WagerRow["left"];
  align: "left" | "right";
  label?: string;
}) {
  const open = seat.wallet === "Open seat";
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border border-[rgba(26,26,26,0.06)] bg-white/70 px-4 py-4 ${
        align === "right" ? "sm:flex-row-reverse sm:border-l sm:pl-6" : "sm:pr-6"
      }`}
    >
      <Identicon seed={open ? "open" : seat.avatar} className="h-11 w-11" />
      <div className={align === "right" ? "sm:text-right" : ""}>
        <p className="font-mono text-[12px] text-[#1a1a1a]">
          {open ? "Open seat" : shortenKey(seat.wallet, 4, 4)}
        </p>
        <p className={`mt-1 font-mono text-[9px] uppercase tracking-[0.14em] ${noteClass(seat.note)}`}>
          {label ?? noteLabel(seat.note)}
        </p>
      </div>
      <p
        className={`ml-auto font-serif text-[34px] leading-none tracking-[-0.04em] text-[#1a1a1a] ${
          align === "right" ? "sm:ml-0 sm:mr-auto" : ""
        }`}
      >
        {seat.belief}%
      </p>
    </div>
  );
}

function RiskMeter({
  label,
  value,
  max,
  side,
}: {
  label: string;
  value: string | null;
  max: string | null;
  side: "left" | "right";
}) {
  // Display-only bar scale: fraction of the max payout.
  const amount = value === null ? 0 : Number.parseFloat(value);
  const ceiling = max === null ? 0 : Number.parseFloat(max);
  const ratio = ceiling > 0 && Number.isFinite(amount) ? Math.min(1, Math.max(0, amount / ceiling)) : 0;
  const width = Math.round(18 + ratio * 74);
  return (
    <div>
      <p
        className={`font-mono text-[10px] uppercase tracking-[0.14em] text-[#5a5a5a] ${
          side === "right" ? "sm:text-right" : ""
        }`}
      >
        {label}: {value === null ? "—" : `$${value}`} USD
      </p>
      <div className={`mt-2 flex h-2 overflow-hidden rounded-full bg-[#ddd8ce] ${side === "right" ? "flex-row-reverse" : ""}`}>
        <div className="h-full w-6 bg-[#3a3344]" />
        <div className="h-full bg-[#c9b8e4]" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 5.2V8.1l1.8 1.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function walletsMatch(a: string | null | undefined, b: string) {
  if (!a) return false;
  if (a === b) return true;
  if (a.startsWith("0x") && b.startsWith("0x")) return a.toLowerCase() === b.toLowerCase();
  return false;
}

function ChangeMindPanel({
  prediction,
  onUpdated,
}: {
  prediction: PredictionDTO;
  onUpdated: (next: PredictionDTO) => void;
}) {
  const { address } = useWallet();
  const owner = walletsMatch(address, prediction.walletAddress);
  const [confidence, setConfidence] = useState(Math.round(prediction.confidencePct));
  const [quoteState, setQuoteState] = useState<{ intent: string; result: EngineQuote } | null>(null);
  const [history, setHistory] = useState<ConfidenceHistoryDTO[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [quoteErrorState, setQuoteErrorState] = useState<{ intent: string; message: string } | null>(
    null,
  );
  // Only a quote (or quote error) for the current inputs counts; stale ones are ignored.
  const quoteIntent = `${prediction.id}:${prediction.confidencePct}:${confidence}`;
  const quote = quoteState?.intent === quoteIntent ? quoteState.result : null;
  const quoteError = quoteErrorState?.intent === quoteIntent ? quoteErrorState.message : null;
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  // One idempotency key per intent (prediction + target confidence); reused on retries.
  const intentKey = useRef<{ intent: string; key: string } | null>(null);
  const positionStatus = prediction.position?.status ?? null;
  const changeable = positionStatus !== null && CHANGEABLE_POSITION_STATUSES.has(positionStatus);

  // Re-sync the slider when the stored confidence changes (adjusting state during render).
  const [syncedPct, setSyncedPct] = useState(prediction.confidencePct);
  if (syncedPct !== prediction.confidencePct) {
    setSyncedPct(prediction.confidencePct);
    setConfidence(Math.round(prediction.confidencePct));
  }

  useEffect(() => {
    let cancelled = false;
    void listConfidenceHistory(prediction.id)
      .then((rows) => {
        if (cancelled) return;
        setHistory(rows);
        setHistoryError(null);
      })
      .catch((error) => {
        if (!cancelled) setHistoryError(describeBettingError(error, "Could not load confidence history."));
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [prediction.id, prediction.confidencePct, prediction.position?.shares]);

  useEffect(() => {
    if (!owner || confidence === Math.round(prediction.confidencePct)) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void quotePrediction({
        marketId: prediction.marketId,
        outcome: prediction.outcome,
        confidencePct: confidence,
        stakeUsd: prediction.stakeUsd,
      })
        .then((result) => {
          if (cancelled) return;
          setQuoteState({ intent: quoteIntent, result });
          setQuoteErrorState(null);
        })
        .catch((error) => {
          if (cancelled) return;
          setQuoteState(null);
          setQuoteErrorState({ intent: quoteIntent, message: describeBettingError(error, "Could not price this confidence.") });
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    owner,
    confidence,
    prediction.confidencePct,
    prediction.marketId,
    prediction.outcome,
    prediction.stakeUsd,
    quoteIntent,
  ]);

  const submit = async () => {
    if (inFlight.current) return;
    if (!address) {
      setMessage("Connect the wallet that opened this position.");
      return;
    }
    if (confidence === Math.round(prediction.confidencePct)) {
      setMessage("Pick a different confidence first.");
      return;
    }
    if (!changeable) {
      setMessage("Confidence can change once the position has filled.");
      return;
    }
    const intent = `${prediction.id}:${confidence}`;
    if (!intentKey.current || intentKey.current.intent !== intent) {
      intentKey.current = { intent, key: crypto.randomUUID() };
    }
    const idempotencyKey = intentKey.current.key;
    inFlight.current = true;
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await changeConfidence(
        prediction.id,
        {
          confidencePct: confidence,
          walletAddress: address,
          quotedMarketPrice: quote?.position?.marketPrice,
          expectedConfidencePct: prediction.confidencePct,
        },
        idempotencyKey,
      );
      intentKey.current = null;
      onUpdated(result.prediction);
      setHistory((rows) => [result.history, ...rows.filter((row) => row.id !== result.history.id)]);
      const fill = result.history.status;
      setMessage(
        fill === "filled"
          ? `Confidence is now ${result.prediction.confidencePct}%. Position ${result.prediction.position?.shares ?? "—"} shares.`
          : fill === "partial"
            ? `Partial fill. Confidence stays at ${result.prediction.confidencePct}% until the rest lands.`
            : fill === "failed"
              ? `Order failed. Confidence stays at ${result.prediction.confidencePct}%.`
              : `Recorded ${result.history.previousConfidencePct}% → ${result.history.newConfidencePct}%.`,
      );
    } catch (error) {
      setMessage(describeBettingError(error, "Could not change confidence."));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const currentShares = prediction.position?.shares ?? "—";
  const desiredShares = quote?.position?.shares;
  const unchanged = confidence === Math.round(prediction.confidencePct);

  return (
    <div className="mt-10 border-t border-[rgba(26,26,26,0.08)] pt-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">
        Change your mind
      </p>
      <p className="mt-2 max-w-[36rem] text-[13px] leading-5 text-[#6e6e6e]">
        Move confidence after the position is open. Previous views stay in history. Only the share
        delta is sent to the book, and inventory updates after the fill is reconciled.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div>
          <p className="font-serif text-[44px] leading-none tracking-[-0.04em] text-[#1a1a1a]">
            {confidence}
            <span className="align-middle font-mono text-[12px] tracking-[0.12em] text-[#8a8a8a]">
              %
            </span>
          </p>
          <p className="mt-2 font-mono text-[11px] text-[#8a8a8a]">
            Now {Math.round(prediction.confidencePct)}% · {currentShares} sh
            {desiredShares && !unchanged ? ` → ${desiredShares} sh` : ""}
          </p>
          <input
            type="range"
            min={1}
            max={99}
            step={1}
            value={confidence}
            disabled={!owner || submitting}
            onChange={(event) => {
              setConfidence(Number(event.target.value));
              setMessage(null);
            }}
            className="mt-5 w-full accent-[#1a1a1a] disabled:opacity-40"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {CONFIDENCE_PRESETS.map((value) => {
              const active = confidence === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!owner || submitting}
                  onClick={() => {
                    setConfidence(value);
                    setMessage(null);
                  }}
                  className={`rounded-full border px-3 py-1.5 font-mono text-[11px] disabled:opacity-40 ${
                    active
                      ? "border-[#c4a46a] bg-[#f3ead8] text-[#1a1a1a]"
                      : "border-[rgba(26,26,26,0.1)] bg-white text-[#5a5a5a]"
                  }`}
                >
                  {value}%
                </button>
              );
            })}
          </div>
          {quoteError && !unchanged ? (
            <p role="status" aria-live="polite" className="mt-4 text-[13px] text-[#8a6a32]">
              {quoteError}
            </p>
          ) : null}
          {owner && !changeable ? (
            <p className="mt-4 text-[13px] text-[#8a8a8a]">
              Confidence can change once the position has filled.
            </p>
          ) : null}
          {quote && !quote.accepted && !unchanged ? (
            <p className="mt-4 text-[13px] text-[#8a6a32]">
              {quote.rejection ? describeQuoteRejection(quote.rejection) : "No edge at this confidence. Submitting will flatten the position."}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!owner || submitting || unchanged || !changeable}
            onClick={() => void submit()}
            className="mt-6 rounded-full bg-[#1a1a1a] px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-white disabled:opacity-40"
          >
            {submitting ? "Adjusting…" : owner ? "Update confidence" : "Owner wallet required"}
          </button>
          {owner && changeable ? (
            <WalletSignatureNote
              className="mt-2"
              hint="Updating asks your wallet for a one-time signature (no gas)."
            />
          ) : null}
          <div aria-live="polite">
            {message ? <p className="mt-3 text-[13px] text-[#5a5a5a]">{message}</p> : null}
          </div>
        </div>

        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9a9a9a]">
            Confidence history
          </p>
          {historyError && history.length === 0 ? (
            <p className="mt-3 text-[13px] text-[#8a6a32]">{historyError}</p>
          ) : historyLoading && history.length === 0 ? (
            <p className="mt-3 text-[13px] text-[#8a8a8a]">Loading history…</p>
          ) : history.length === 0 ? (
            <p className="mt-3 text-[13px] text-[#8a8a8a]">No changes yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {history.map((row) => (
                <li
                  key={row.id}
                  className="rounded-2xl border border-[rgba(26,26,26,0.06)] bg-white/70 px-4 py-3"
                >
                  <p className="font-serif text-[20px] tracking-[-0.03em] text-[#1a1a1a]">
                    {row.previousConfidencePct}% → {row.newConfidencePct}%
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-[#6e6e6e]">
                    {row.side} {row.deltaShares} sh · {row.previousPosition.shares} →{" "}
                    {row.desiredPosition.shares} ·{" "}
                    <StatusChip kind="confidence" status={row.status} />
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#9a9a9a]">
                    book {row.marketPrice} · {new Date(row.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

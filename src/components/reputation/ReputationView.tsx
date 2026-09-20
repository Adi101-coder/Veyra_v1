"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "@/components/wallet/WalletProvider";
import { Identicon } from "@/components/dashboard/Identicon";
import { Shell } from "@/components/Shell";
import { describeBettingError } from "@/lib/betting";
import { getUserReputation, listUserPredictions } from "@/lib/betting-api";
import { shortenAddress } from "@/lib/solana-wallet";
import { brier, pct, pctValue, roi } from "@/components/reputation/format";
import { CalibrationList } from "@/components/reputation/CalibrationList";
import { CategoryTable } from "@/components/reputation/CategoryTable";
import { PredictionHistory } from "@/components/reputation/PredictionHistory";
import type { Loadable, Reputation, ScoredPrediction } from "@/components/reputation/types";

const labelClass = "font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]";

export function ReputationView() {
  const { address } = useWallet();
  const key = address?.toLowerCase() ?? "";
  const [nonce, setNonce] = useState(0);
  const requestKey = `${key}#${nonce}`;
  const [reputation, setReputation] = useState<Loadable<Reputation> | null>(null);
  const [predictions, setPredictions] = useState<Loadable<ScoredPrediction[]> | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    getUserReputation(address)
      .then((res) => {
        if (!cancelled) setReputation({ key: requestKey, status: "ready", data: res.reputation as Reputation });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setReputation({ key: requestKey, status: "error", error: describeBettingError(error, "Could not load reputation.") });
      });
    listUserPredictions(address)
      .then((res) => {
        if (!cancelled)
          setPredictions({ key: requestKey, status: "ready", data: res.predictions as ScoredPrediction[] });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setPredictions({ key: requestKey, status: "error", error: describeBettingError(error, "Could not load predictions.") });
      });
    return () => {
      cancelled = true;
    };
  }, [address, requestKey]);

  if (!address) {
    return (
      <div className="bg-[#f4f2ed]">
        <Shell className="max-w-3xl pt-10 pb-20">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c45c5c]">Track record</p>
          <h1 className="mt-3 font-serif text-[32px] leading-tight tracking-[-0.03em] text-[#1a1a1a] sm:text-[42px]">
            Reputation.
          </h1>
          <p className="mt-4 max-w-[32rem] text-[15px] leading-6 text-[#6e6e6e] italic">
            Connect a wallet first. VEYRA scores the predictions that address opened once
            their markets resolve.
          </p>
        </Shell>
      </div>
    );
  }

  // Keep the previous result visible while a manual refresh runs for the same wallet.
  const rep = reputation && reputation.key.startsWith(`${key}#`) ? reputation : null;
  const preds = predictions && predictions.key.startsWith(`${key}#`) ? predictions : null;
  const refreshing =
    reputation?.key !== requestKey || predictions?.key !== requestKey;
  const data = rep?.status === "ready" ? rep.data : null;
  const doc = data?.documentation;
  const resolved = data?.resolvedPredictions ?? 0;
  const hasScores = resolved > 0;

  return (
    <div className="bg-[#f4f2ed]">
      <Shell className="max-w-3xl pt-8 pb-20">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c45c5c]">Track record</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-[32px] leading-tight tracking-[-0.03em] text-[#1a1a1a] sm:text-[42px]">
              Reputation.
            </h1>
            <p className="mt-3 max-w-[34rem] text-[15px] leading-6 text-[#6e6e6e] italic">
              Scores come only from resolved, filled predictions — open or unfilled orders
              never count.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            disabled={refreshing}
            className="rounded-full border border-[#1a1a1a] px-4 py-1.5 font-serif text-[14px] text-[#1a1a1a] transition hover:bg-[#1a1a1a] hover:text-white disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className="mt-8 flex items-center gap-4 rounded-[22px] border border-[rgba(26,26,26,0.08)] bg-white px-5 py-5">
          <Identicon seed={address} className="h-12 w-12" />
          <div className="min-w-0 flex-1">
            <p className={labelClass}>Forecaster</p>
            <p className="mt-1 truncate font-serif text-[20px] tracking-[-0.03em] text-[#1a1a1a]">
              {shortenAddress(address, 6)}
            </p>
          </div>
          <div className="text-right">
            <p className={labelClass}>Opened</p>
            <p className="mt-1 font-serif text-[20px] tracking-[-0.03em] text-[#1a1a1a]">
              {data ? data.totalPredictions : "—"}
            </p>
          </div>
        </div>

        <section className="mt-8 border-t border-[rgba(26,26,26,0.12)] pt-6">
          {!rep ? (
            <p className="py-6 text-[13px] italic text-[#8a8a8a]">Reading the record…</p>
          ) : rep.status === "error" ? (
            <p className="py-6 text-[13px] text-[#c45c6a]">{rep.error}</p>
          ) : data ? (
            <>
              {!hasScores ? (
                <p className="mb-6 text-[13px] italic text-[#8a8a8a]">
                  No resolved predictions yet. Scores appear after markets you hold resolve.
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
                <Metric
                  label="Resolved"
                  value={`${data.resolvedPredictions} of ${data.totalPredictions}`}
                  hint={hasScores ? `${data.correctPredictions} landed` : "Opened predictions"}
                />
                <Metric
                  label="Accuracy"
                  value={hasScores ? pct(data.accuracy) : "—"}
                  hint="Picked outcome matched"
                  help={doc?.accuracy}
                />
                <Metric
                  label="Brier score"
                  value={hasScores ? brier(data.brierScore) : "—"}
                  hint="Lower is better · 0 is perfect"
                  help={doc?.brierScore}
                />
                <Metric
                  label="Avg confidence"
                  value={hasScores ? pctValue(data.averageConfidencePct) : "—"}
                  hint="Stated at resolution"
                  help={doc?.averageConfidence}
                />
                <Metric
                  label="Calibration error"
                  value={hasScores ? pct(data.calibration.ece) : "—"}
                  hint="ECE · lower is better"
                  help={doc?.calibrationEce}
                />
                <Metric
                  label="ROI"
                  value={hasScores ? roi(data.roi) : "—"}
                  hint="PnL over filled cost"
                  help={doc?.roi}
                />
              </div>

              {hasScores ? (
                <>
                  <Heading label="Calibration" title="Stated vs. realized." />
                  <CalibrationList bins={data.calibration.bins} />
                  <Heading label="Categories" title="By market type." />
                  <CategoryTable categories={data.categories} />
                </>
              ) : null}
            </>
          ) : null}
        </section>

        <Heading label="History" title="Predictions." />
        {!preds ? (
          <p className="py-6 text-[13px] italic text-[#8a8a8a]">Loading predictions…</p>
        ) : preds.status === "error" ? (
          <p className="py-6 text-[13px] text-[#c45c6a]">{preds.error}</p>
        ) : (
          <PredictionHistory predictions={preds.data} />
        )}

        <p className="mt-8">
          <Link
            href="/activity"
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8a8a8a] no-underline hover:text-[#1a1a1a]"
          >
            Wallet activity
          </Link>
        </p>
      </Shell>
    </div>
  );
}

function Heading({ label, title }: { label: string; title: string }) {
  return (
    <div className="mt-12 mb-3 border-b border-[rgba(26,26,26,0.12)] pb-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c45c5c]">{label}</p>
      <h2 className="mt-2 font-serif text-[24px] leading-none tracking-[-0.03em] text-[#1a1a1a]">{title}</h2>
    </div>
  );
}

function Metric({ label, value, hint, help }: { label: string; value: string; hint: string; help?: string }) {
  return (
    <div className="min-w-0" title={help}>
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9a9a9a]">
        {label}
        {help ? (
          <span aria-hidden className="ml-1 cursor-help text-[#c8c4bc]">
            ?
          </span>
        ) : null}
      </p>
      <p className="mt-1 font-serif text-[24px] leading-none tracking-[-0.03em] text-[#1a1a1a]">{value}</p>
      <p className="mt-1 text-[12px] italic leading-4 text-[#8a8a8a]">{hint}</p>
      {help ? <span className="sr-only">{help}</span> : null}
    </div>
  );
}

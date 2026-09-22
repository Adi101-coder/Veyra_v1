import Link from "next/link";
import { brier, humanStatus, usd } from "@/components/reputation/format";
import type { ScoredPrediction } from "@/components/reputation/types";

export function PredictionHistory({ predictions }: { predictions: ScoredPrediction[] }) {
  if (!predictions.length) {
    return (
      <p className="px-1 py-6 text-[13px] italic text-[#65758b]">
        This wallet has not opened any predictions yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[rgba(24,45,74,0.08)]">
      {predictions.map((prediction) => {
        const score = prediction.score;
        const status =
          prediction.position?.status ?? prediction.execution?.status ?? prediction.status;
        const voided = prediction.marketResolution?.outcome === "INVALID";
        return (
          <li key={prediction.id}>
            <Link
              href={`/contract/${encodeURIComponent(prediction.marketId)}/wager/${encodeURIComponent(prediction.id)}`}
              className="flex flex-col gap-2 px-1 py-4 no-underline transition hover:bg-[#f8fbff] sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-2"
            >
              <div className="min-w-0">
                <p className="font-serif text-[14px] text-[#182d4a]">{prediction.marketTitle}</p>
                <p className="mt-0.5 font-mono text-[11px] text-[#65758b]">
                  <span className={prediction.outcome === "YES" ? "text-[#182d4a]" : "text-[#ad4c62]"}>
                    {prediction.outcome}
                  </span>
                  <span className="text-[#dce5f1]"> · </span>
                  {prediction.confidencePct}% conf.
                  <span className="text-[#dce5f1]"> · </span>
                  {usd(prediction.stakeUsd)} stake
                  <span className="text-[#dce5f1]"> · </span>
                  <span className="uppercase tracking-[0.08em]">{humanStatus(status)}</span>
                </p>
              </div>
              <div className="shrink-0 sm:text-right">
                {score ? (
                  <>
                    <p
                      className={`font-mono text-[10px] uppercase tracking-[0.16em] ${
                        score.correct ? "text-[#2f9e6e]" : "text-[#ad4c62]"
                      }`}
                    >
                      {score.correct ? "Landed" : "Missed"}
                      <span className="text-[#dce5f1]"> · </span>
                      <span className="text-[#65758b]">Resolved {score.resolvedOutcome}</span>
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-[#65758b]">
                      Brier {brier(score.brierScore)}
                      <span className="text-[#dce5f1]"> · </span>
                      <span className={score.pnlUsd.startsWith("-") ? "text-[#ad4c62]" : "text-[#182d4a]"}>
                        PnL {usd(score.pnlUsd, true)}
                      </span>
                    </p>
                  </>
                ) : voided ? (
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b]">Voided</p>
                ) : (
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#65758b]">Unresolved</p>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

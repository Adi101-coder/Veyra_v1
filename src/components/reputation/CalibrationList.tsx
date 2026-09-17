import { pct, pctValue } from "@/components/reputation/format";
import type { ReputationBin } from "@/components/reputation/types";

function clampPct(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function CalibrationList({ bins }: { bins: ReputationBin[] }) {
  const rows = bins.filter((bin) => bin.sampleCount > 0);
  if (!rows.length) {
    return <p className="px-1 py-6 text-[13px] italic text-[#8a8a8a]">No calibration samples yet.</p>;
  }

  return (
    <ul className="divide-y divide-[rgba(26,26,26,0.08)]">
      {rows.map((bin) => {
        const range = bin.bin.replace("-", "–");
        const realized = pct(bin.empiricalAccuracy, 0);
        const stated = pctValue(bin.meanConfidencePct, 0);
        return (
          <li key={bin.bin} className="px-1 py-3 sm:px-2">
            <div className="flex items-baseline justify-between gap-4">
              <p className="font-serif text-[14px] text-[#1a1a1a]">{range}% stated</p>
              <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a8a8a]">
                {bin.sampleCount} {bin.sampleCount === 1 ? "sample" : "samples"}
              </p>
            </div>
            <div
              role="img"
              aria-label={`${range}% bin: realized accuracy ${realized}, mean stated confidence ${stated}, ${bin.sampleCount} samples`}
              className="relative mt-2 h-[6px] rounded-full bg-[rgba(26,26,26,0.08)]"
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[#1a1a1a]"
                style={{ width: `${clampPct(bin.empiricalAccuracy * 100)}%` }}
              />
              <div
                className="absolute -top-[3px] -bottom-[3px] w-[2px] -translate-x-1/2 bg-[#c45c5c]"
                style={{ left: `${clampPct(bin.meanConfidencePct)}%` }}
              />
            </div>
            <p className="mt-1.5 font-mono text-[11px] text-[#8a8a8a]">
              Realized {realized}
              <span className="text-[#c8c4bc]"> · </span>
              <span className="text-[#c45c5c]">Stated {stated}</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

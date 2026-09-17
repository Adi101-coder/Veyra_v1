import { brier, pct, roi } from "@/components/reputation/format";
import type { ReputationCategory } from "@/components/reputation/types";

const th = "px-1 py-2 font-mono text-[9px] font-normal uppercase tracking-[0.16em] text-[#9a9a9a] sm:px-2";
const td = "px-1 py-3 font-mono text-[12px] text-[#1a1a1a] sm:px-2";

export function CategoryTable({ categories }: { categories: ReputationCategory[] }) {
  if (!categories.length) {
    return <p className="px-1 py-6 text-[13px] italic text-[#8a8a8a]">No category breakdown yet.</p>;
  }

  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-[rgba(26,26,26,0.08)]">
            <th scope="col" className={th}>Category</th>
            <th scope="col" className={`${th} text-right`}>Resolved</th>
            <th scope="col" className={`${th} text-right`}>Accuracy</th>
            <th scope="col" className={`${th} text-right`}>Brier</th>
            <th scope="col" className={`${th} text-right`}>ROI</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(26,26,26,0.08)]">
          {categories.map((row) => {
            const scored = row.resolvedPredictions > 0;
            return (
              <tr key={row.category}>
                <th scope="row" className="px-1 py-3 font-serif text-[14px] font-normal capitalize text-[#1a1a1a] sm:px-2">
                  {row.category}
                </th>
                <td className={`${td} text-right`}>
                  {row.resolvedPredictions}
                  <span className="text-[#b0b0b0]">/{row.totalPredictions}</span>
                </td>
                <td className={`${td} text-right`}>{scored ? pct(row.accuracy, 0) : "—"}</td>
                <td className={`${td} text-right`}>{scored ? brier(row.brierScore) : "—"}</td>
                <td className={`${td} text-right`}>{scored ? roi(row.roi) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

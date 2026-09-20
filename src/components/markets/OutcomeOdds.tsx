import type { MarketOutcome } from "@/lib/markets";

type OutcomeOddsProps = {
  outcomes: MarketOutcome[];
  limit?: number;
};

function isBinaryPair(outcomes: MarketOutcome[]) {
  return outcomes.length === 2 && outcomes.some((row) => /^(yes|no)$/i.test(row.label));
}

export function OutcomeOdds({ outcomes, limit = 3 }: OutcomeOddsProps) {
  const rows = outcomes.slice(0, Math.max(2, limit));
  const hidden = Math.max(0, outcomes.length - rows.length);
  const binary = isBinaryPair(outcomes);

  return (
    <div>
      {binary ? (
        <div className="mb-3 flex h-1.5 overflow-hidden rounded-full bg-[#efece6]">
          <span className="h-full bg-[#2c7a55]" style={{ width: `${rows[0]?.chance ?? 50}%` }} />
          <span className="h-full bg-[#c45c6a]" style={{ width: `${rows[1]?.chance ?? 50}%` }} />
        </div>
      ) : null}

      {binary ? (
        <div className="grid grid-cols-2 gap-2">
          {rows.map((row, index) => {
            const yes = index === 0;
            return (
              <div
                key={row.label}
                className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 ${
                  yes ? "bg-[#eef6f1]" : "bg-[#f7eef0]"
                }`}
              >
                <p
                  className={`min-w-0 truncate text-[12px] font-medium ${yes ? "text-[#2c7a55]" : "text-[#b4454a]"}`}
                  title={row.label}
                >
                  {row.label}
                </p>
                <p className="shrink-0 text-[13px] font-semibold tabular-nums tracking-[-0.02em] text-[#171717]">
                  {row.chance}%
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <li key={row.label}>
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-[13px] leading-5 text-[#3a3a3a]" title={row.label}>
                  {row.label}
                </p>
                <p className="shrink-0 text-[13px] font-semibold tabular-nums tracking-[-0.02em] text-[#171717]">
                  {row.chance}%
                </p>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#efece6]">
                <span
                  className={`block h-full rounded-full ${index === 1 && outcomes.length === 2 ? "bg-[#c45c6a]" : "bg-[#2c7a55]"}`}
                  style={{ width: `${row.chance}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {hidden > 0 ? (
        <p className="mt-2 text-[12px] text-[#8b887f]">+{hidden} more</p>
      ) : null}
    </div>
  );
}

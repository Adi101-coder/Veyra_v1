"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cardClass } from "@/components/markets/primitives";
import { listPools, type PoolSummary } from "@/lib/betting-api";

/**
 * Veyra-native pools, voted in by the community. Real data — unlike the sample
 * sections on this page, every row here is a market that exists in the database.
 */
export function PoolsSection() {
  const [pools, setPools] = useState<PoolSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPools()
      .then((result) => {
        if (!cancelled) setPools(result.pools);
      })
      .catch(() => {
        if (!cancelled) setPools([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing voted in yet: say nothing rather than showing an empty shell.
  if (!pools || pools.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[20px] font-semibold tracking-[-0.03em] text-[#182d4a]">
          Veyra pools
        </h2>
        <Link href="/vote" className="font-mono text-[11px] text-[#65758b] underline">
          Vote on tomorrow&apos;s
        </Link>
      </div>
      <ul className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {pools.map((pool) => (
          <li key={pool.id}>
            <Link href={`/contract/${encodeURIComponent(pool.id)}`} className={`${cardClass} block px-5 py-5`}>
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#657da0]">
                {pool.tag || pool.category}
              </p>
              <p className="mt-2 line-clamp-2 min-h-[2.6em] text-[15px] leading-tight font-medium text-[#182d4a]">
                {pool.title}
              </p>
              {pool.proposerWallet ? (
                <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-[#657da0]">
                  Proposed by {pool.proposerWallet.slice(0, 6)}…{pool.proposerWallet.slice(-4)}
                </p>
              ) : null}
              <div className="mt-3 flex items-center justify-between">
                {pool.funded && pool.yesPriceBps != null ? (
                  <>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#65758b]">
                      Yes
                    </span>
                    <span className="text-[18px] font-semibold tabular-nums text-[#182d4a]">
                      {(pool.yesPriceBps / 100).toFixed(0)}%
                    </span>
                  </>
                ) : (
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#83a6e9]">
                    Awaiting liquidity
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

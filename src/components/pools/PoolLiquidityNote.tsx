"use client";

import { useEffect, useState } from "react";

type PoolInfo = {
  funded: boolean;
  reason?: string;
  feeBps?: number;
  maxLossMicros?: string;
};

const usd = (micros: string | undefined) => {
  if (!micros) return null;
  const value = Number(BigInt(micros)) / 1_000_000;
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
};

/**
 * Explains, on the pool itself, that Veyra is the counterparty here and where that
 * money comes from. Veyra-native pools price against a Veyra-funded market maker
 * rather than a peer, which is a materially different deal from a Polymarket
 * market, so it is stated on the page rather than only in the docs.
 */
export function PoolLiquidityNote({ marketId }: { marketId: string }) {
  const [info, setInfo] = useState<PoolInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/pools/${encodeURIComponent(marketId)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data) setInfo(data as PoolInfo);
      })
      .catch(() => {
        // The note is supplementary: if it cannot load, the page is still correct.
      });
    return () => {
      cancelled = true;
    };
  }, [marketId]);

  if (!info) return null;

  if (!info.funded) {
    return (
      <p className="mt-4 rounded-md border border-[#dce5f1] bg-[#f8fbff] px-4 py-3 font-mono text-[11px] leading-relaxed text-[#65758b]">
        <span className="text-[#182d4a]">Awaiting liquidity.</span> This pool was voted in but
        the liquidity fund cannot cover it yet, so it is not quoting a price. A pool with no
        counterparty has no honest odds, so Veyra shows none.
      </p>
    );
  }

  const cap = usd(info.maxLossMicros);
  const fee = info.feeBps != null ? (info.feeBps / 100).toFixed(info.feeBps % 100 === 0 ? 0 : 2) : null;

  return (
    <p className="mt-4 rounded-md border border-[#dce5f1] bg-[#f8fbff] px-4 py-3 font-mono text-[11px] leading-relaxed text-[#65758b]">
      <span className="text-[#182d4a]">Veyra pool.</span> The five most-voted questions each
      day open against Veyra&apos;s liquidity fund, which is built from trading fees; whatever is
      not committed to a pool stays in the reserve. Veyra takes the other side of your trade
      here{cap ? <> and caps what this pool can lose at {cap}</> : null}. Prices move as people
      buy, so what you pay depends on size.
      {fee ? <> A {fee}% fee applies to profit when the pool resolves.</> : null}
    </p>
  );
}

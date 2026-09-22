"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Identicon } from "@/components/dashboard/Identicon";
import { useWallet } from "@/components/wallet/WalletProvider";
import { isKnownStatus, statusLabel, StatusChip } from "@/components/status/StatusChip";
import { WalletSignatureNote } from "@/components/status/WalletSignatureNote";
import { PoolLiquidityNote } from "@/components/pools/PoolLiquidityNote";
import { Shell } from "@/components/Shell";
import {
  formatResolvesBy,
  shortenKey,
  type Market,
  type WagerRow,
} from "@/lib/markets";
import { describeBettingError, describeQuoteRejection, predictionToWagerRow, type EngineQuote } from "@/lib/betting";
import {
  getLiveTrades,
  getMarketConviction,
  getMarketHolders,
  listPredictions,
  placePrediction,
  quotePrediction,
} from "@/lib/betting-api";
import { LiveHolders, LiveTape } from "@/components/markets/LiveTape";
import type { LiveTrade, VenueHolder } from "@/lib/polymarket";
import {
  convictionTrailLabel,
  formatConvictionPct,
  formatDivergence,
  type MarketConviction,
} from "@/lib/conviction";
import { shortenAddress } from "@/lib/solana-wallet";

const STAKE_PRESETS = [10, 25, 50, 100, 250];
const CONFIDENCE_PRESETS = [60, 70, 80, 90];

function Clause({
  n,
  label,
  prompt,
}: {
  n: string;
  label: string;
  prompt: string;
}) {
  return (
    <div>
      <p className="flex items-baseline font-serif text-[22px] leading-none tracking-[-0.03em] text-[#182d4a]">
        <SectionMark />
        {n}
      </p>
      <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#65758b]">
        {label}
      </p>
      <p className="mt-2 max-w-[7.5rem] text-[12px] leading-4 italic text-[#657da0]">{prompt}</p>
    </div>
  );
}

function SectionMark() {
  return (
    <span
      className="relative mr-0.5 inline-block h-[1em] w-[0.7em] shrink-0"
      aria-hidden
    >
      <span className="absolute top-[-0.08em] left-0 italic leading-none">S</span>
      <span className="absolute top-[0.26em] left-[0.08em] italic leading-none">S</span>
    </span>
  );
}

export function ContractView({ market }: { market: Market }) {
  const isVeyraPool = market.source === "veyra";
  const sourceLabel =
    market.source === "polymarket"
      ? "Polymarket"
      : isVeyraPool
        ? market.proposerWallet
          ? `Split pool · proposed by ${market.proposerWallet.slice(0, 6)}…${market.proposerWallet.slice(-4)}`
          : "Split pool · community voted"
        : "Demo · paper only";
  const liquidityLabel =
    typeof market.liquidityUsd === "number" && Number.isFinite(market.liquidityUsd)
      ? `$${Math.round(market.liquidityUsd).toLocaleString("en-US")}`
      : "—";
  const conditionLabel = market.conditionId ? shortenKey(market.conditionId, 4, 4) : "—";
  const [rows, setRows] = useState<WagerRow[]>([]);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [convictionStale, setConvictionStale] = useState(false);
  const [hideExpired, setHideExpired] = useState(false);
  const [hideResolved, setHideResolved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingRows, setLoadingRows] = useState(true);
  const [conviction, setConviction] = useState<MarketConviction | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const predictions = await listPredictions(market.id);
        if (cancelled) return;
        setRows(predictions.map((item) => predictionToWagerRow(item, shortenKey)));
        setRowsError(null);
      } catch (error) {
        if (!cancelled) setRowsError(describeBettingError(error, "Could not load positions."));
      } finally {
        if (!cancelled) setLoadingRows(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [market.id]);

  useEffect(() => {
    let cancelled = false;
    // Timestamp (ms) of the snapshot currently shown; older snapshots are ignored.
    let latestAt = Number.NEGATIVE_INFINITY;
    const snapshotTime = (payload: MarketConviction) => {
      const stamp = payload.asOf ?? payload.snapshotAt;
      const parsed = stamp ? Date.parse(stamp) : Number.NaN;
      return Number.isFinite(parsed) ? parsed : null;
    };
    const apply = (payload: MarketConviction, fromStream: boolean) => {
      if (cancelled || !payload.marketId) return;
      const at = snapshotTime(payload);
      if (at !== null) {
        if (at < latestAt) return;
        latestAt = at;
      } else if (!fromStream && latestAt > Number.NEGATIVE_INFINITY) {
        // An undated REST snapshot must not overwrite a stream event.
        return;
      }
      setConviction(payload);
      setConvictionStale(false);
    };
    void getMarketConviction(market.id)
      .then((payload) => apply(payload, false))
      .catch(() => {
        // keep whatever the stream delivers; nothing shown until then
      });

    const stream = new EventSource(`/api/markets/${encodeURIComponent(market.id)}/conviction/stream`);
    stream.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as MarketConviction & {
          error?: { code?: string; message?: string };
        };
        if (payload.error) {
          if (payload.error.code === "MARKET_NOT_FOUND" || payload.error.code === "NOT_FOUND") {
            stream.close();
          }
          if (!cancelled) setConvictionStale(true);
          return;
        }
        apply(payload, true);
      } catch {
        // keep the last good snapshot
      }
    };
    stream.onerror = () => {
      // EventSource reconnects on its own; dim the last value until a fresh event lands.
      if (!cancelled) setConvictionStale(true);
    };
    return () => {
      cancelled = true;
      stream.close();
    };
  }, [market.id]);

  const visible = rows.filter((row) => {
    if (hideExpired && row.expired) return false;
    if (hideResolved && row.resolution === "RESOLVED") return false;
    return true;
  });

  const share = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="bg-[#f8fbff]">
      <Shell className="pt-4 pb-16 sm:pt-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <p className="flex items-center gap-2 font-serif text-[13px] tracking-[0.01em] text-[#65758b]">
            <Link href="/dashboard" className="text-[#536780] no-underline hover:text-[#182d4a]">
              ← Dashboard
            </Link>
            <span>/</span>
            <span className="text-[#182d4a]">Contract</span>
          </p>
          <Link
            href="/dashboard"
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#65758b] no-underline hover:text-[#182d4a]"
          >
            Close ×
          </Link>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="rounded-[22px] border border-[rgba(24,45,74,0.06)] bg-[#ffffff] px-5 py-6 sm:px-8 sm:py-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#65758b]">
                  <span className="inline-flex items-center gap-1.5 text-[#265bff]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#265bff]" />
                    Contract
                  </span>
                  <span>Finalized</span>
                </p>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-[rgba(24,45,74,0.12)] bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b]">
                    Public
                  </span>
                  <button
                    type="button"
                    onClick={share}
                    className="rounded-full border border-[rgba(24,45,74,0.12)] bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b] hover:text-[#182d4a]"
                  >
                    {copied ? "Copied" : "‹ Share"}
                  </button>
                </div>
              </div>

              <h1 className="mt-5 max-w-[36rem] font-serif text-[30px] leading-[1.15] tracking-[-0.03em] text-[#182d4a] sm:text-[36px]">
                {market.title}
              </h1>

              {isVeyraPool ? <PoolLiquidityNote marketId={market.id} /> : null}

              <div className="mt-6 grid gap-5 sm:grid-cols-3">
                <div className="flex items-center gap-2.5">
                  <Identicon seed={market.id} className="h-8 w-8" />
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#657da0]">
                      Source
                    </p>
                    <p className="min-w-0 break-words font-mono text-[12px] text-[#182d4a]">
                      {sourceLabel}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#657da0]">
                    Condition
                  </p>
                  <p className="mt-1 font-mono text-[12px] text-[#182d4a]">
                    {conditionLabel}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#657da0]">
                    Liquidity
                  </p>
                  <p className="mt-1 font-mono text-[12px] text-[#182d4a]">{liquidityLabel}</p>
                </div>
              </div>

              <div
                className={`mt-6 grid gap-5 sm:grid-cols-3 ${convictionStale ? "opacity-50" : ""}`}
                title={convictionStale ? "Live updates paused — showing last value" : undefined}
              >
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#657da0]">
                    Conviction
                  </p>
                  <p className="mt-1 font-mono text-[12px] text-[#182d4a]">
                    {formatConvictionPct(conviction?.conviction ?? null)}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#657da0]">
                    {conviction?.polymarketSource === "resolved" ? "Polymarket (resolved)" : "Polymarket"}
                  </p>
                  <p className="mt-1 font-mono text-[12px] text-[#182d4a]">
                    {formatConvictionPct(conviction?.polymarketProbability ?? null)}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#657da0]">
                    Divergence
                  </p>
                  <p className="mt-1 font-mono text-[12px] text-[#182d4a]">
                    {formatDivergence(conviction?.divergence ?? null)}
                  </p>
                </div>
              </div>
              {conviction && conviction.participants > 0 ? (
                <ConvictionBreakdown conviction={conviction} stale={convictionStale} />
              ) : null}
              {convictionTrailLabel(conviction?.trail ?? []) ? (
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[#65758b]">
                  {convictionTrailLabel(conviction?.trail ?? [])}
                </p>
              ) : null}

              <div className="mt-8 grid gap-6 border-t border-[rgba(24,45,74,0.06)] pt-6 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-x-6">
                <Clause n="01" label="Terms" prompt="How does this resolve?" />
                <p className="self-center text-[14px] italic text-[#65758b]">No terms attached.</p>
              </div>

              <div className="mt-6 grid gap-6 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-x-6">
                <Clause n="02" label="Resolution" prompt="When is it judged?" />
                <div className="self-center">
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#657da0]">
                    Resolves by
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 font-serif text-[18px] tracking-[-0.02em] text-[#182d4a] sm:text-[20px]">
                    {formatResolvesBy(market.resolvesAt)}
                    <span className="rounded-full border border-[rgba(38,91,255,0.45)] bg-[#e8f0ff] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#1847d8]">
                      T-{market.resolvesIn.replace(/left/i, "").trim()}
                    </span>
                  </p>
                </div>
              </div>
            </section>

            {market.source === "polymarket" ? <VenueActivity marketId={market.id} /> : null}

            <section className="rounded-[22px] border border-[rgba(24,45,74,0.06)] bg-[#ffffff] px-5 py-5 sm:px-7 sm:py-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#182d4a]">
                  Wagers{" "}
                  <span className="text-[#65758b]">{visible.length}</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHideExpired((value) => !value)}
                    className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
                      hideExpired
                        ? "border-[#265bff] bg-[#265bff] text-white"
                        : "border-[rgba(24,45,74,0.12)] bg-white text-[#65758b]"
                    }`}
                  >
                    Hide expired
                  </button>
                  <button
                    type="button"
                    onClick={() => setHideResolved((value) => !value)}
                    className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
                      hideResolved
                        ? "border-[#265bff] bg-[#265bff] text-white"
                        : "border-[rgba(24,45,74,0.12)] bg-white text-[#65758b]"
                    }`}
                  >
                    Hide resolved
                  </button>
                </div>
              </div>

              <div className="scroll-x-pane">
                <table className="w-full min-w-[720px] border-collapse text-left">
                  <thead>
                    <tr className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#657da0]">
                      <th className="pb-3 font-normal">Seat</th>
                      <th className="pb-3 font-normal">Belief</th>
                      <th className="pb-3 font-normal">Stake ↓</th>
                      <th className="pb-3 font-normal">Gold ↓</th>
                      <th className="pb-3 font-normal">Lock by ↑</th>
                      <th className="pb-3 font-normal">Mechanism</th>
                      <th className="pb-3 font-normal">Resolution</th>
                      <th className="pb-3 text-right font-normal">Belief</th>
                      <th className="pb-3 text-right font-normal">Seat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => (
                      <WagerTableRow key={row.id} marketId={market.id} row={row} />
                    ))}
                  </tbody>
                </table>
                {visible.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[#65758b]">
                    {loadingRows
                      ? "Loading positions…"
                      : rowsError
                        ? rowsError
                        : "No confidence positions on this contract yet."}
                  </p>
                ) : null}
              </div>
            </section>
          </div>

          <CreateWagerCard
            market={market}
            onPlace={(row) => setRows((current) => [row, ...current])}
          />
        </div>
      </Shell>
    </div>
  );
}

function VenueActivity({ marketId }: { marketId: string }) {
  const [trades, setTrades] = useState<LiveTrade[]>([]);
  const [holders, setHolders] = useState<VenueHolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tapeError, setTapeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [tape, book] = await Promise.all([
          getLiveTrades({ marketId, limit: 12 }),
          getMarketHolders(marketId),
        ]);
        if (cancelled) return;
        setTrades(tape.trades);
        setHolders(book.holders);
        setTapeError(tape.error ?? book.error ?? null);
      } catch {
        if (!cancelled) setTapeError("Could not load the Polymarket tape.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [marketId]);

  return (
    <div className="flex flex-col gap-4">
      <LiveTape trades={trades} loading={loading} error={tapeError} />
      <LiveHolders holders={holders} loading={loading} />
    </div>
  );
}

function formatUsd2(value: number) {
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : "—";
}

function ConvictionBreakdown({ conviction, stale }: { conviction: MarketConviction; stale: boolean }) {
  const sides = [conviction.outcomes.YES, conviction.outcomes.NO];
  const hasCapital = sides.some((side) => side.capitalCommitted > 0);
  return (
    <div className={`mt-4 ${stale ? "opacity-50" : ""}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#65758b]">
        {conviction.participants} {conviction.participants === 1 ? "participant" : "participants"} · $
        {conviction.totalCapitalUsd} filled
      </p>
      {hasCapital ? (
        <div
          className="mt-2 flex h-1 w-full overflow-hidden rounded-full bg-[rgba(24,45,74,0.06)]"
          aria-hidden="true"
        >
          <span className="h-full bg-[#2f9e6e]" style={{ flexGrow: Math.max(0, conviction.outcomes.YES.capitalCommitted), flexBasis: 0 }} />
          <span className="h-full bg-[#ad4c62]" style={{ flexGrow: Math.max(0, conviction.outcomes.NO.capitalCommitted), flexBasis: 0 }} />
        </div>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-4">
        {sides.map((side) => (
          <div key={side.outcome} className="min-w-0">
            <p
              className={`font-mono text-[9px] uppercase tracking-[0.16em] ${
                side.outcome === "YES" ? "text-[#2f9e6e]" : "text-[#ad4c62]"
              }`}
            >
              {side.outcome}
            </p>
            <p className="mt-1 font-mono text-[11px] leading-5 text-[#182d4a]">
              {side.participants} · {formatUsd2(side.capitalCommitted)} filled
            </p>
            <p className="font-mono text-[10px] leading-4 text-[#65758b]">
              avg {formatConvictionPct(side.averageConfidence)} · weighted{" "}
              {formatConvictionPct(side.capitalWeightedConfidence)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WagerTableRow({ marketId, row }: { marketId: string; row: WagerRow }) {
  const router = useRouter();
  const href = row.id.includes("-local-")
    ? null
    : `/contract/${marketId}/wager/${row.id}`;

  return (
    <tr
      className={`border-t border-[rgba(24,45,74,0.06)] ${
        href ? "cursor-pointer hover:bg-white/70" : ""
      }`}
      onClick={() => {
        if (href) router.push(href);
      }}
    >
      <td className="py-3 pr-3">
        <Identicon
          seed={row.left.wallet === "Open seat" ? "open" : row.left.avatar}
          className="h-8 w-8"
        />
      </td>
      <td className="py-3 pr-3 font-serif text-[22px] tracking-[-0.03em] text-[#182d4a]">
        {row.left.belief}%
      </td>
      <td className="py-3 pr-3 font-mono text-[12px] text-[#536780]">{row.stake}</td>
      <td className="py-3 pr-3 font-mono text-[12px] text-[#536780]">{row.gold}</td>
      <td className="py-3 pr-3 font-mono text-[12px] text-[#536780]">
        {isKnownStatus("order", row.lockBy) ? <StatusChip kind="order" status={row.lockBy} /> : row.lockBy}
      </td>
      <td className="py-3 pr-3 font-mono text-[12px] text-[#536780]">{row.mechanism}</td>
      <td className="py-3 pr-3">
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${
            row.resolution === "PENDING"
              ? "bg-[#e8f0ff] text-[#1847d8]"
              : "bg-[#e8f0ff] text-[#2f9e6e]"
          }`}
        >
          {row.resolution}
        </span>
      </td>
      <td className="py-3 pr-3 text-right font-serif text-[22px] tracking-[-0.03em] text-[#182d4a]">
        {row.right.belief}%
      </td>
      <td className="py-3">
        <span className="flex justify-end">
          <Identicon
            seed={row.right.wallet === "Open seat" ? "open" : row.right.avatar}
            className="h-8 w-8"
          />
        </span>
      </td>
    </tr>
  );
}

function CreateWagerCard({
  market,
  onPlace,
}: {
  market: Market;
  onPlace: (row: WagerRow) => void;
}) {
  const { address } = useWallet();
  const yes = market.seats.find((seat) => seat.side === "lands")?.chance ?? 50;
  const [outcome, setOutcome] = useState<"YES" | "NO">("YES");
  const [confidence, setConfidence] = useState(Math.min(99, Math.max(1, yes + 15)));
  const [stake, setStake] = useState(25);
  const [details, setDetails] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [quoteState, setQuoteState] = useState<{ intent: string; result: EngineQuote } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [quoteErrorState, setQuoteErrorState] = useState<{ intent: string; message: string } | null>(
    null,
  );
  // Only a quote (or quote error) for the current inputs counts; stale ones are ignored.
  const quoteIntent = `${market.id}:${outcome}:${confidence}:${stake.toFixed(2)}`;
  const quote = quoteState?.intent === quoteIntent ? quoteState.result : null;
  const quoteError = quoteErrorState?.intent === quoteIntent ? quoteErrorState.message : null;
  const inFlight = useRef(false);
  // One idempotency key per intent (outcome/confidence/stake); reused on retries.
  const intentKey = useRef<{ intent: string; key: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setQuoting(true);
      void quotePrediction({
        marketId: market.id,
        outcome,
        confidencePct: confidence,
        stakeUsd: stake.toFixed(2),
      })
        .then((result) => {
          if (cancelled) return;
          setQuoteState({ intent: quoteIntent, result });
          setQuoteErrorState(null);
        })
        .catch((error) => {
          if (!cancelled) {
            setQuoteState(null);
            setQuoteErrorState({ intent: quoteIntent, message: describeBettingError(error, "Quote failed.") });
          }
        })
        .finally(() => {
          if (!cancelled) setQuoting(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [market.id, outcome, confidence, stake, quoteIntent]);

  const place = async () => {
    if (inFlight.current) return;
    if (!address) {
      setMessage("Connect a wallet to make a wager.");
      return;
    }
    if (stake <= 0) {
      setMessage("Stake has to be greater than 0.");
      return;
    }
    if (!quote?.accepted) {
      setMessage("Waiting for a quote that matches these inputs.");
      return;
    }
    if (!intentKey.current || intentKey.current.intent !== quoteIntent) {
      intentKey.current = { intent: quoteIntent, key: crypto.randomUUID() };
    }
    const idempotencyKey = intentKey.current.key;
    inFlight.current = true;
    setSubmitting(true);
    setMessage(null);
    try {
      const prediction = await placePrediction(
        {
          marketId: market.id,
          outcome,
          confidencePct: confidence,
          stakeUsd: stake.toFixed(2),
          walletAddress: address,
        },
        idempotencyKey,
      );
      intentKey.current = null;
      onPlace(predictionToWagerRow(prediction, shortenKey));
      const fill = prediction.execution?.status ?? prediction.status;
      setMessage(
        fill === "failed" || fill === "rejected"
          ? `Order: ${statusLabel("order", fill)}.${prediction.errorMessage ? ` ${prediction.errorMessage}` : ""}`
          : prediction.position && Number.parseFloat(prediction.position.shares) > 0
            ? `Position: ${statusLabel("order", fill)}. ${prediction.position.shares} ${outcome} shares at ${prediction.position.avgPrice}.`
            : `Order: ${statusLabel("order", fill)}. Shares appear once fills are recorded.`,
      );
    } catch (error) {
      const text = describeBettingError(error, "Could not place prediction.");
      setMessage(
        error && typeof error === "object" && "code" in error && error.code === "INSUFFICIENT_FUNDS"
          ? `${text} Open Balances to deposit.`
          : text,
      );
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const position = quote?.position;
  const rejected = quote && !quote.accepted ? quote.rejection : null;
  const paperOnly =
    quote !== null && (quote.book.source === "synthetic" || quote.market.source !== "polymarket");

  return (
    <aside className="rounded-[22px] border border-[rgba(24,45,74,0.06)] bg-[#ffffff] px-5 py-6 lg:sticky lg:top-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#182d4a]">
        Create a wager
      </p>

      <div className="mt-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b]">Outcome</p>
        <div className="mt-3 flex rounded-full border border-[rgba(24,45,74,0.1)] bg-white p-1">
          {(["YES", "NO"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setOutcome(value);
                setMessage(null);
              }}
              className={`flex-1 rounded-full px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] ${
                outcome === value ? "bg-[#265bff] text-white" : "text-[#536780]"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b]">
          Confidence
        </p>
        <p className="mt-2 text-[13px] leading-5 text-[#65758b]">
          Your probability that {outcome} is the correct resolution. The engine only sizes a
          position when you have edge versus the live book.
        </p>
        <p className="mt-5 font-serif text-[44px] leading-none tracking-[-0.04em] text-[#182d4a]">
          {confidence}
          <span className="align-middle font-mono text-[12px] tracking-[0.12em] text-[#65758b]">
            %
          </span>
        </p>
        <input
          type="range"
          min={1}
          max={99}
          step={1}
          value={confidence}
          onChange={(event) => {
            setConfidence(Number(event.target.value));
            setMessage(null);
          }}
          className="mt-5 w-full accent-[#182d4a]"
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {CONFIDENCE_PRESETS.map((value) => {
            const active = confidence === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setConfidence(value);
                  setMessage(null);
                }}
                className={`rounded-full border px-3 py-1.5 font-mono text-[11px] ${
                  active
                    ? "border-[#265bff] bg-[#e8f0ff] text-[#182d4a]"
                    : "border-[rgba(24,45,74,0.1)] bg-white text-[#536780]"
                }`}
              >
                {value}%
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b]">Stake</p>
        <p className="mt-2 text-[13px] leading-5 text-[#65758b]">
          Maximum USDC you are willing to deploy. Kelly sizing may use less than this.
        </p>
        <p className="mt-5 font-serif text-[44px] leading-none tracking-[-0.04em] text-[#182d4a]">
          {stake.toFixed(2)}{" "}
          <span className="align-middle font-mono text-[12px] tracking-[0.12em] text-[#65758b]">
            USDC
          </span>
        </p>
        <input
          type="range"
          min={1}
          max={500}
          step={1}
          value={stake}
          onChange={(event) => {
            setStake(Number(event.target.value));
            setMessage(null);
          }}
          className="mt-5 w-full accent-[#182d4a]"
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {STAKE_PRESETS.map((value) => {
            const active = stake === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setStake(value);
                  setMessage(null);
                }}
                className={`rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] ${
                  active
                    ? "border-[#265bff] bg-[#e8f0ff] text-[#182d4a]"
                    : "border-[rgba(24,45,74,0.1)] bg-white text-[#536780]"
                }`}
              >
                ${value}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[rgba(24,45,74,0.08)] bg-white px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b]">
          {quoting ? "Pricing…" : "Engine quote"}
          {paperOnly ? <span className="text-[#83a6e9]"> · Demo market · paper only</span> : null}
        </p>
        {quoteError && !quote ? (
          <p role="status" aria-live="polite" className="mt-2 text-[13px] leading-5 text-[#1847d8]">
            {quoteError}
          </p>
        ) : rejected ? (
          <p className="mt-2 text-[13px] leading-5 text-[#1847d8]">{describeQuoteRejection(rejected)}</p>
        ) : position ? (
          <div className="mt-2 space-y-1 font-mono text-[11px] text-[#536780]">
            <p>
              Buy {position.shares} {position.outcome} @ {position.limitPrice}
            </p>
            <p>Notional ${position.notionalUsd} · edge {position.edgeBps} bps</p>
            <p>If right, payout ${position.payoutUsd}</p>
          </div>
        ) : (
          <p className="mt-2 text-[13px] text-[#65758b]">Waiting for a valid quote.</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => void place()}
        disabled={submitting || !quote?.accepted}
        className="mt-8 w-full rounded-2xl bg-[#265bff] py-3.5 text-[13px] font-semibold tracking-[0.16em] text-white uppercase hover:bg-[#1847d8] disabled:cursor-not-allowed disabled:bg-[#dce5f1] disabled:text-[#65758b]"
      >
        {submitting ? "Placing…" : "Make wager"}
      </button>
      <WalletSignatureNote className="mt-2" />
      <div aria-live="polite">
        {message ? <p className="mt-3 text-[12px] leading-5 text-[#65758b]">{message}</p> : null}
      </div>

      <button
        type="button"
        onClick={() => setDetails((value) => !value)}
        className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b]"
      >
        Details {details ? "▴" : "▾"}
      </button>
      {details ? (
        <p className="mt-2 text-[12px] leading-5 text-[#65758b]">
          ConfidenceEngine {quote?.engineVersion ?? "v1"} converts your view into a Polymarket
          {address ? ` order for ${shortenAddress(address)}` : " order"}. Credentials stay on the
          server. {market.title} resolves in {market.resolvesIn}.
        </p>
      ) : null}
    </aside>
  );
}

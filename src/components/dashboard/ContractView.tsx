"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Identicon } from "@/components/dashboard/Identicon";
import { useWallet } from "@/components/wallet/WalletProvider";
import { Shell } from "@/components/Shell";
import {
  formatResolvesBy,
  formatUsd,
  marketAddress,
  marketCreatedLabel,
  marketCreator,
  marketWagers,
  shortenKey,
  type Market,
  type WagerRow,
} from "@/lib/markets";
import { shortenAddress } from "@/lib/solana-wallet";

const STAKE_PRESETS = [0, 0.1, 0.5, 1, 2, 5];
const LOCK_PRESETS = [3, 12, 24];

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
      <p className="flex items-baseline font-serif text-[22px] leading-none tracking-[-0.03em] text-[#1a1a1a]">
        <SectionMark />
        {n}
      </p>
      <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
        {label}
      </p>
      <p className="mt-2 max-w-[7.5rem] text-[12px] leading-4 italic text-[#9a9a9a]">{prompt}</p>
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

function formatLockStamp(now: number, hours: number) {
  const date = new Date(now + hours * 60 * 60 * 1000);
  const time = date.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const day = date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${time} ${day}`;
}

export function ContractView({ market }: { market: Market }) {
  const creator = marketCreator(market);
  const address = marketAddress(market);
  const created = marketCreatedLabel(market);
  const seeded = useMemo(() => marketWagers(market), [market]);
  const [rows, setRows] = useState(seeded);
  const [hideExpired, setHideExpired] = useState(false);
  const [hideResolved, setHideResolved] = useState(false);
  const [copied, setCopied] = useState(false);

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
    <div className="bg-[#eceae4]">
      <Shell className="pt-4 pb-16 sm:pt-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <p className="flex items-center gap-2 font-serif text-[13px] tracking-[0.01em] text-[#8a8a8a]">
            <Link href="/dashboard" className="text-[#5a5a5a] no-underline hover:text-[#1a1a1a]">
              ← Dashboard
            </Link>
            <span>/</span>
            <span className="text-[#1a1a1a]">Contract</span>
          </p>
          <Link
            href="/dashboard"
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8a8a8a] no-underline hover:text-[#1a1a1a]"
          >
            Close ×
          </Link>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="rounded-[22px] border border-[rgba(26,26,26,0.06)] bg-[#f7f5f0] px-5 py-6 sm:px-8 sm:py-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">
                  <span className="inline-flex items-center gap-1.5 text-[#c4a46a]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#c4a46a]" />
                    Contract
                  </span>
                  <span>Finalized</span>
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

              <h1 className="mt-5 max-w-[36rem] font-serif text-[30px] leading-[1.15] tracking-[-0.03em] text-[#1a1a1a] sm:text-[36px]">
                {market.title}
              </h1>

              <div className="mt-6 grid gap-5 sm:grid-cols-3">
                <div className="flex items-center gap-2.5">
                  <Identicon seed={creator.avatar} className="h-8 w-8" />
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9a9a9a]">
                      Creator
                    </p>
                    <p className="font-mono text-[12px] text-[#1a1a1a]">
                      {shortenKey(creator.wallet, 5, 4)}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9a9a9a]">
                    Address
                  </p>
                  <p className="mt-1 font-mono text-[12px] text-[#1a1a1a]">
                    {shortenKey(address, 4, 4)}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9a9a9a]">
                    Created
                  </p>
                  <p className="mt-1 font-mono text-[12px] text-[#1a1a1a]">{created}</p>
                </div>
              </div>

              <div className="mt-8 grid gap-6 border-t border-[rgba(26,26,26,0.06)] pt-6 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-x-6">
                <Clause n="01" label="Terms" prompt="How does this resolve?" />
                <p className="self-center text-[14px] italic text-[#8a8a8a]">No terms attached.</p>
              </div>

              <div className="mt-6 grid gap-6 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-x-6">
                <Clause n="02" label="Resolution" prompt="When is it judged?" />
                <div className="self-center">
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9a9a9a]">
                    Resolves by
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 font-serif text-[18px] tracking-[-0.02em] text-[#1a1a1a] sm:text-[20px]">
                    {formatResolvesBy(market.resolvesAt)}
                    <span className="rounded-full border border-[rgba(196,164,106,0.45)] bg-[#f3ead8] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a6a32]">
                      T-{market.resolvesIn.replace(/left/i, "").trim()}
                    </span>
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[22px] border border-[rgba(26,26,26,0.06)] bg-[#f7f5f0] px-5 py-5 sm:px-7 sm:py-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#1a1a1a]">
                  Wagers{" "}
                  <span className="text-[#8a8a8a]">{visible.length}</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHideExpired((value) => !value)}
                    className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
                      hideExpired
                        ? "border-[#1a1a1a] bg-[#1a1a1a] text-white"
                        : "border-[rgba(26,26,26,0.12)] bg-white text-[#6e6e6e]"
                    }`}
                  >
                    Hide expired
                  </button>
                  <button
                    type="button"
                    onClick={() => setHideResolved((value) => !value)}
                    className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
                      hideResolved
                        ? "border-[#1a1a1a] bg-[#1a1a1a] text-white"
                        : "border-[rgba(26,26,26,0.12)] bg-white text-[#6e6e6e]"
                    }`}
                  >
                    Hide resolved
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left">
                  <thead>
                    <tr className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9a9a9a]">
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
                  <p className="py-8 text-center text-sm text-[#8a8a8a]">
                    No wagers match those filters.
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

function WagerTableRow({ marketId, row }: { marketId: string; row: WagerRow }) {
  const router = useRouter();
  const href = row.id.includes("-local-")
    ? null
    : `/contract/${marketId}/wager/${row.id}`;

  return (
    <tr
      className={`border-t border-[rgba(26,26,26,0.06)] ${
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
      <td className="py-3 pr-3 font-serif text-[22px] tracking-[-0.03em] text-[#1a1a1a]">
        {row.left.belief}%
      </td>
      <td className="py-3 pr-3 font-mono text-[12px] text-[#5a5a5a]">{row.stake}</td>
      <td className="py-3 pr-3 font-mono text-[12px] text-[#5a5a5a]">{row.gold}</td>
      <td className="py-3 pr-3 font-mono text-[12px] text-[#5a5a5a]">{row.lockBy}</td>
      <td className="py-3 pr-3 font-mono text-[12px] text-[#5a5a5a]">{row.mechanism}</td>
      <td className="py-3 pr-3">
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${
            row.resolution === "PENDING"
              ? "bg-[#f3ead8] text-[#8a6a32]"
              : "bg-[#e7f4ec] text-[#2f9e6e]"
          }`}
        >
          {row.resolution}
        </span>
      </td>
      <td className="py-3 pr-3 text-right font-serif text-[22px] tracking-[-0.03em] text-[#1a1a1a]">
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
  const [stake, setStake] = useState(0.5);
  const [lockHours, setLockHours] = useState(24);
  const [now, setNow] = useState<number | null>(null);
  const [details, setDetails] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const place = () => {
    if (!address) {
      setMessage("Connect a wallet to make a wager.");
      return;
    }
    if (stake <= 0) {
      setMessage("Stake has to be greater than 0.");
      return;
    }
    onPlace({
      id: `${market.id}-local-${Date.now()}`,
      stake: `${stake.toFixed(2)} SOL`,
      gold: "1/2",
      lockBy: "Open",
      mechanism: "Peer",
      resolution: "PENDING",
      expired: false,
      left: {
        wallet: shortenAddress(address),
        avatar: address,
        belief: 50,
        note: "LOCKED",
      },
      right: {
        wallet: "Open seat",
        avatar: "open",
        belief: 50,
        note: "OPEN",
      },
    });
    setMessage("Wager posted. The other seat is still open.");
  };

  return (
    <aside className="rounded-[22px] border border-[rgba(26,26,26,0.06)] bg-[#f7f5f0] px-5 py-6 lg:sticky lg:top-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#1a1a1a]">
        Create a wager
      </p>

      <div className="mt-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">Stake</p>
        <p className="mt-2 text-[13px] leading-5 text-[#6e6e6e]">
          The base cost of a Seat in this Wager. Both parties put up the same amount — the winner
          claims from the loser&apos;s Stake.
        </p>
        <p className="mt-5 font-serif text-[44px] leading-none tracking-[-0.04em] text-[#1a1a1a]">
          {stake.toFixed(2)}{" "}
          <span className="align-middle font-mono text-[12px] tracking-[0.12em] text-[#8a8a8a]">
            SOL
          </span>{" "}
          <span className="align-middle font-sans text-[13px] text-[#b0b0b0]">
            ≈ {formatUsd(stake)}
          </span>
        </p>
        <input
          type="range"
          min={0}
          max={5}
          step={0.01}
          value={stake}
          onChange={(event) => {
            setStake(Number(event.target.value));
            setMessage(null);
          }}
          className="mt-5 w-full accent-[#1a1a1a]"
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {STAKE_PRESETS.map((value) => {
            const active = Math.abs(stake - value) < 0.001;
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
                    ? "border-[#c4a46a] bg-[#f3ead8] text-[#1a1a1a]"
                    : "border-[rgba(26,26,26,0.1)] bg-white text-[#5a5a5a]"
                }`}
              >
                {value} SOL
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">Lock by</p>
        <p className="mt-2 text-[13px] leading-5 text-[#6e6e6e]">
          The deadline by which both parties must Lock their beliefs.
        </p>
        <p className="mt-4 flex flex-wrap items-center gap-2 font-serif text-[15px] text-[#1a1a1a]">
          {now ? formatLockStamp(now, lockHours) : "—"}
          <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a8a8a]">
            ◷ {lockHours}h window
          </span>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {LOCK_PRESETS.map((value) => {
            const active = lockHours === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setLockHours(value)}
                className={`rounded-full border px-3 py-1.5 font-mono text-[11px] ${
                  active
                    ? "border-[#c4a46a] bg-[#f3ead8] text-[#1a1a1a]"
                    : "border-[rgba(26,26,26,0.1)] bg-white text-[#5a5a5a]"
                }`}
              >
                +{value} hrs
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={place}
        className="mt-8 w-full rounded-2xl bg-[#111111] py-3.5 text-[13px] font-semibold tracking-[0.16em] text-white uppercase hover:bg-black"
      >
        Make wager
      </button>
      {message ? (
        <p className="mt-3 text-[12px] leading-5 text-[#6e6e6e]">{message}</p>
      ) : null}

      <button
        type="button"
        onClick={() => setDetails((value) => !value)}
        className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]"
      >
        Details {details ? "▴" : "▾"}
      </button>
      {details ? (
        <p className="mt-2 text-[12px] leading-5 text-[#6e6e6e]">
          This is a peer table on {market.title}. Wagers settle 1:1. Resolution follows the
          contract clock ({market.resolvesIn} left).
        </p>
      ) : null}
    </aside>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Identicon } from "@/components/dashboard/Identicon";
import { Shell } from "@/components/Shell";
import {
  categoryColor,
  categoryLabel,
  formatResolvesParts,
  parseStakeSol,
  shortenKey,
  wagerAddress,
  wagerCreatedParts,
  type Market,
  type SeatNote,
  type WagerRow,
} from "@/lib/markets";

function clip(value: number) {
  return Math.min(0.99, Math.max(0.01, value));
}

function riskSol(belief: number, stake: number, side: "left" | "right") {
  const p = clip(belief / 100);
  if (side === "left") return stake * -Math.log10(1 - p);
  return stake * (-Math.log10(p) / 2);
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

export function WagerView({ market, wager }: { market: Market; wager: WagerRow }) {
  const [copied, setCopied] = useState(false);
  const color = categoryColor(market.category);
  const address = wagerAddress(wager.id);
  const created = wagerCreatedParts(wager.id);
  const resolves = formatResolvesParts(market.resolvesAt);
  const stake = parseStakeSol(wager.stake);
  const leftRisk = riskSol(wager.left.belief, stake, "left");
  const rightRisk = riskSol(wager.right.belief, stake, "right");
  const creator =
    wager.right.wallet !== "Open seat" ? wager.right : wager.left;
  const filled = wager.gold;

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
              <Meta label="Seats" value={filled.replace("/", " / ")} />
              <Meta label="Address" value={shortenKey(address, 4, 4)} />
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
            <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-[rgba(26,26,26,0.1)] bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#5a5a5a]">
              {wager.resolution === "PENDING" ? "Pending" : "Resolved"}
              <ClockIcon />
            </span>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 sm:gap-0">
            <SeatPanel seat={wager.left} align="left" />
            <SeatPanel seat={wager.right} align="right" />
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <RiskMeter label="Risk" value={leftRisk} side="left" />
            <RiskMeter label="Risk" value={rightRisk} side="right" />
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
        </section>
      </Shell>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
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
}: {
  seat: WagerRow["left"];
  align: "left" | "right";
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
          {noteLabel(seat.note)}
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
  side,
}: {
  label: string;
  value: number;
  side: "left" | "right";
}) {
  const width = Math.min(92, 18 + value * 400);
  return (
    <div>
      <p
        className={`font-mono text-[10px] uppercase tracking-[0.14em] text-[#5a5a5a] ${
          side === "right" ? "sm:text-right" : ""
        }`}
      >
        {label}: {value.toFixed(4)} SOL
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

"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";

type Judgment = "pending" | "landed" | "missed" | "push";

const clip = (value: number) => Math.min(0.99, Math.max(0.01, value));

function yourCurve(x: number) {
  return 0.72 * (1 - Math.exp(-2.15 * x));
}

function opponentCurve(x: number) {
  return x ** 2.12;
}

function yourRiskSol(p: number, stake: number) {
  return stake * -Math.log10(1 - clip(p));
}

function opponentRiskSol(q: number, stake: number) {
  return stake * (-Math.log10(clip(q)) / 2);
}

function expectedProfit(p: number, q: number, stake: number) {
  const lp = clip(p);
  const lq = clip(q);
  const score =
    lp * Math.log10(lp / lq) + (1 - lp) * Math.log10((1 - lp) / (1 - lq));
  return score * stake * 0.5;
}

function formatSol(value: number) {
  const abs = Math.abs(value).toFixed(4);
  if (value > 0.00005) return `+${abs}`;
  if (value < -0.00005) return `-${abs}`;
  return abs;
}

export function HowItWorksView() {
  const [you, setYou] = useState(78);
  const [opponent, setOpponent] = useState(16);
  const [stake, setStake] = useState(0.5);
  const [judgment, setJudgment] = useState<Judgment>("pending");

  const p = you / 100;
  const q = opponent / 100;
  const xLine = Math.max(p, q);
  const riskYou = yourRiskSol(p, stake);
  const riskOpp = opponentRiskSol(q, stake);
  const pending = expectedProfit(p, q, stake);
  const ifLand = stake * 0.5 * Math.log10(clip(p) / clip(q));
  const ifMiss = stake * 0.5 * Math.log10((1 - clip(p)) / (1 - clip(q)));

  const shown = useMemo(() => {
    if (judgment === "landed") return ifLand;
    if (judgment === "missed") return ifMiss;
    if (judgment === "push") return 0;
    return pending;
  }, [judgment, ifLand, ifMiss, pending]);

  return (
    <div className="bg-[#eceae4]">
      <Shell className="pt-4 pb-20 sm:pt-6">
        <p className="mb-8 flex flex-wrap items-center gap-2 font-serif text-[13px] text-[#8a8a8a]">
          <Link href="/dashboard" className="text-[#5a5a5a] no-underline hover:text-[#1a1a1a]">
            ← Dashboard
          </Link>
          <span>/</span>
          <span className="text-[#1a1a1a]">How it Works</span>
        </p>

        <h1 className="font-serif text-[32px] leading-none tracking-[-0.03em] text-[#1a1a1a] sm:text-[40px]">
          How certainty maps to risk
        </h1>
        <p className="mt-4 max-w-[46rem] text-[14px] leading-6 text-[#5a5a5a]">
          Move the sliders to see how your LAND belief and your opponent&apos;s belief set the
          amount each side puts at risk. The vertical line sits at the higher certainty — where
          risk is priced — and the dots show each side&apos;s normalized stake.
        </p>

        <div className="mt-8 rounded-[22px] border border-[rgba(26,26,26,0.06)] bg-[#f7f5f0] px-4 py-5 sm:px-8 sm:py-7">
          <CertaintyChart you={p} opponent={q} xLine={xLine} />

          <div className="mt-8">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">
                Certainty
              </p>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-[rgba(26,26,26,0.12)] bg-white px-2.5 py-1 font-mono text-[10px] text-[#5a5a5a]">
                  Opponent {opponent}%
                </span>
                <span className="rounded-full border border-[rgba(26,26,26,0.12)] bg-white px-2.5 py-1 font-mono text-[10px] text-[#1a1a1a]">
                  You {you}%
                </span>
              </div>
            </div>

            <DualSlider
              you={you}
              opponent={opponent}
              onYou={setYou}
              onOpponent={setOpponent}
            />

            <div className="mt-3 flex items-center gap-5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a8a8a]">
              <span className="inline-flex items-center gap-2">
                <span className="h-px w-5 bg-[#1a1a1a]/50" />
                Your risk
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-[3px] w-5 bg-[#1a1a1a]" />
                Opponent risk
              </span>
            </div>
          </div>

          <div className="mt-10">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">Vault</p>
            <div className="mt-3 flex items-center justify-between gap-4 font-mono text-[11px] uppercase tracking-[0.12em] text-[#5a5a5a]">
              <span>
                Risk: {riskYou.toFixed(4)} SOL
              </span>
              <span>
                Risk: {riskOpp.toFixed(4)} SOL
              </span>
            </div>
            <VaultBar left={riskYou} right={riskOpp} />
          </div>

          <div className="mt-10">
            <p className="text-center font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">
              Set your judgment
            </p>
            <div className="mx-auto mt-4 grid max-w-[36rem] grid-cols-2 gap-3 sm:grid-cols-4">
              <JudgmentCard
                label="Pending"
                active={judgment === "pending"}
                onClick={() => setJudgment("pending")}
                icon={<ClockIcon />}
              />
              <JudgmentCard
                label="Landed"
                active={judgment === "landed"}
                onClick={() => setJudgment("landed")}
                icon={<CheckIcon className="text-[#2f9e6e]" />}
              />
              <JudgmentCard
                label="Missed"
                active={judgment === "missed"}
                onClick={() => setJudgment("missed")}
                icon={<MissIcon />}
              />
              <JudgmentCard
                label="Push"
                active={judgment === "push"}
                onClick={() => setJudgment("push")}
                icon={<PushIcon />}
              />
            </div>
            <p className="mx-auto mt-4 max-w-[28rem] text-center text-[13px] leading-5 text-[#6e6e6e]">
              Pick the outcome you believe is correct. Both seats must agree, or the wager
              settles as a Push.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-4 rounded-[22px] border border-[rgba(26,26,26,0.06)] bg-[#f7f5f0] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <label className="block w-20">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                Stake
              </span>
              <input
                type="number"
                min={0.05}
                max={5}
                step={0.05}
                value={stake}
                onChange={(event) => setStake(Number(event.target.value) || 0)}
                className="mt-1 w-full border-b border-[rgba(26,26,26,0.2)] bg-transparent py-1 font-serif text-[22px] outline-none"
              />
            </label>
            <input
              type="range"
              min={0.05}
              max={5}
              step={0.05}
              value={stake}
              onChange={(event) => setStake(Number(event.target.value))}
              className="mt-5 w-full max-w-xs accent-[#1a1a1a] sm:max-w-sm"
            />
          </div>
          <p className="hidden text-[12px] italic text-[#8a8a8a] sm:block sm:max-w-[12rem]">
            Changes payout numbers only, not the curve shape
          </p>
          <div className="text-right">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8a8a8a]">
              Expected profit p(g) + (1-p)(-r)
            </p>
            <p
              className={`mt-1 font-serif text-[28px] leading-none tracking-[-0.03em] ${
                shown > 0.00005
                  ? "text-[#2f9e6e]"
                  : shown < -0.00005
                    ? "text-[#c45c6a]"
                    : "text-[#1a1a1a]"
              }`}
            >
              {formatSol(shown)} SOL
            </p>
          </div>
        </div>
        <p className="mt-2 text-[12px] italic text-[#8a8a8a] sm:hidden">
          Changes payout numbers only, not the curve shape
        </p>
      </Shell>
    </div>
  );
}

function CertaintyChart({
  you,
  opponent,
  xLine,
}: {
  you: number;
  opponent: number;
  xLine: number;
}) {
  const W = 640;
  const H = 268;
  const L = 36;
  const R = 12;
  const T = 12;
  const B = 28;
  const innerW = W - L - R;
  const innerH = H - T - B;
  const x = (value: number) => L + value * innerW;
  const y = (value: number) => T + (1 - value) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const path = (fn: (value: number) => number) => {
    const pts = Array.from({ length: 49 }, (_, i) => {
      const t = i / 48;
      return `${i === 0 ? "M" : "L"} ${x(t).toFixed(2)} ${y(fn(t)).toFixed(2)}`;
    });
    return pts.join(" ");
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Certainty versus risk">
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={x(tick)}
            x2={x(tick)}
            y1={T}
            y2={H - B}
            stroke="rgba(180, 170, 140, 0.35)"
            strokeWidth="1"
          />
          <line
            x1={L}
            x2={W - R}
            y1={y(tick)}
            y2={y(tick)}
            stroke="rgba(180, 170, 140, 0.35)"
            strokeWidth="1"
          />
          <text x={L - 8} y={y(tick) + 4} textAnchor="end" className="fill-[#8a8a8a]" fontSize="11">
            {tick === 0 ? "0" : tick === 1 ? "1" : String(tick).replace(/^0/, "0")}
          </text>
          <text x={x(tick)} y={H - 8} textAnchor="middle" className="fill-[#8a8a8a]" fontSize="11">
            {tick === 0 ? "0" : tick}
          </text>
        </g>
      ))}
      <path d={path(yourCurve)} fill="none" stroke="#1a1a1a" strokeWidth="1.4" opacity="0.55" />
      <path d={path(opponentCurve)} fill="none" stroke="#1a1a1a" strokeWidth="2.8" />
      <line
        x1={x(xLine)}
        x2={x(xLine)}
        y1={T}
        y2={H - B}
        stroke="#1a1a1a"
        strokeWidth="1"
        strokeDasharray="4 5"
        opacity="0.55"
      />
      <circle cx={x(xLine)} cy={y(yourCurve(xLine))} r="5" fill="#1a1a1a" />
      <circle cx={x(xLine)} cy={y(opponentCurve(xLine))} r="5.5" fill="#1a1a1a" />
      <title>{`You ${Math.round(you * 100)}%, opponent ${Math.round(opponent * 100)}%`}</title>
    </svg>
  );
}

function DualSlider({
  you,
  opponent,
  onYou,
  onOpponent,
}: {
  you: number;
  opponent: number;
  onYou: (value: number) => void;
  onOpponent: (value: number) => void;
}) {
  return (
    <div className="relative pt-7 pb-2">
      <span
        className="absolute top-0 font-mono text-[10px] text-[#8a8a8a]"
        style={{ left: `calc(${opponent}% - 2.2rem)` }}
      >
        Opponent {opponent}%
      </span>
      <span
        className="absolute top-0 font-mono text-[10px] text-[#1a1a1a]"
        style={{ left: `calc(${you}% - 1.4rem)` }}
      >
        You {you}%
      </span>
      <div className="relative h-2 rounded-full bg-[linear-gradient(90deg,#f3c1c8_0%,#f4f1ea_50%,#b7e0c6_100%)]">
        <span
          className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-[#1a1a1a]/30"
          style={{ left: "50%" }}
        />
        <input
          aria-label="Opponent certainty"
          type="range"
          min={1}
          max={99}
          value={opponent}
          onChange={(event) => onOpponent(Number(event.target.value))}
          className="certainty-thumb certainty-thumb-opp absolute inset-0 w-full appearance-none bg-transparent"
        />
        <input
          aria-label="Your certainty"
          type="range"
          min={1}
          max={99}
          value={you}
          onChange={(event) => onYou(Number(event.target.value))}
          className="certainty-thumb certainty-thumb-you absolute inset-0 w-full appearance-none bg-transparent"
        />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
        <span className="text-[#c45c6a]">Missed · 0%</span>
        <span className="text-[#2f9e6e]">Landed · 100%</span>
      </div>
    </div>
  );
}

function VaultBar({ left, right }: { left: number; right: number }) {
  const total = left + right || 1;
  const leftPct = (left / total) * 50;
  const rightPct = (right / total) * 50;

  return (
    <div className="relative mt-3 flex h-2.5 items-center">
      <div className="flex h-2.5 flex-1 justify-end overflow-hidden rounded-l-full bg-[#ddd8ce]">
        <div className="flex h-full" style={{ width: `${leftPct * 2}%` }}>
          <div className="h-full w-8 bg-[#3a3344]" />
          <div className="h-full flex-1 bg-[#c9b8e4]" />
        </div>
      </div>
      <span className="relative z-10 mx-0.5 h-4 w-px bg-[#1a1a1a]/40" />
      <div className="flex h-2.5 flex-1 overflow-hidden rounded-r-full bg-[#ddd8ce]">
        <div className="flex h-full" style={{ width: `${rightPct * 2}%` }}>
          <div className="h-full flex-1 bg-[#c9b8e4]" />
          <div className="h-full w-8 bg-[#3a3344]" />
        </div>
      </div>
    </div>
  );
}

function JudgmentCard({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 font-mono text-[11px] uppercase tracking-[0.16em] ${
        active
          ? "border-[#1a1a1a] bg-white text-[#1a1a1a]"
          : "border-[rgba(26,26,26,0.1)] bg-[#fbfaf7] text-[#6e6e6e]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v4.2l2.6 1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${className}`} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.5 12.2 11 14.7 15.6 9.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function MissIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#c45c6a]" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9.2 9.2 14.8 14.8M14.8 9.2 9.2 14.8" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function PushIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#d08a4a]" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    </svg>
  );
}

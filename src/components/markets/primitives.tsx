"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Crest } from "@/lib/market-feed";

const sizes = {
  sm: "h-7 w-7 text-[8px]",
  md: "h-10 w-10 text-[9px]",
  lg: "h-16 w-16 text-[13px]",
  xl: "h-[4.5rem] w-[4.5rem] text-[15px]",
} as const;

function hash(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function inkFor(color: string) {
  const raw = color.replace("#", "");
  if (raw.length < 6) return "#fff";
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 165 ? "#182d4a" : "#ffffff";
}

function FlagDot({ code, className = "" }: { code: string; className?: string }) {
  const flags: Record<string, [string, string]> = {
    PL: ["#dc143c", "#fff"],
    US: ["#3c3b6e", "#b22234"],
    UA: ["#0057b7", "#ffd700"],
    RU: ["#fff", "#d52b1e"],
  };
  const [a, b] = flags[code] ?? ["#888", "#222"];
  return (
    <span
      className={`absolute right-0 bottom-0 h-3.5 w-3.5 overflow-hidden rounded-full ring-2 ring-white ${className}`}
      aria-hidden
    >
      <span className="absolute inset-x-0 top-0 h-1/2" style={{ background: a }} />
      <span className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: b }} />
    </span>
  );
}

export function Photo({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={96}
      height={96}
      className={`object-cover ${className}`}
    />
  );
}

export function CrestMark({
  crest,
  size = "md",
}: {
  crest: Crest;
  size?: keyof typeof sizes;
}) {
  const dim = sizes[size];
  const ink = crest.ink ?? inkFor(crest.color);
  const motif = hash(crest.initials) % 6;
  const uid = `c-${crest.initials}-${crest.color.replace("#", "")}`;

  if (crest.image) {
    return (
      <span className={`relative inline-flex shrink-0 ${dim}`}>
        <Photo
          src={crest.image}
          alt=""
          className="h-full w-full rounded-full ring-1 ring-[#dce5f1]/10"
        />
        {crest.flag ? <FlagDot code={crest.flag} /> : null}
      </span>
    );
  }

  const shape = crest.shape ?? "shield";

  return (
    <span className={`relative inline-flex shrink-0 ${dim}`} aria-hidden>
      <svg viewBox="0 0 48 48" className="h-full w-full drop-shadow-[0_1px_1px_rgba(0,0,0,0.12)]">
        <defs>
          <linearGradient id={uid} x1="18" y1="4" x2="30" y2="46" gradientUnits="userSpaceOnUse">
            <stop stopColor={crest.color} />
            <stop offset="1" stopColor={crest.color} stopOpacity="0.72" />
          </linearGradient>
        </defs>
        {shape === "hex" ? (
          <polygon points="24,3 42,13 42,35 24,45 6,35 6,13" fill={`url(#${uid})`} />
        ) : shape === "circle" ? (
          <circle cx="24" cy="24" r="20" fill={`url(#${uid})`} />
        ) : (
          <path
            d="M24 3.5 41 10.2v13.2c0 10.4-7.2 18.2-17 21.2C14.2 41.6 7 33.8 7 23.4V10.2Z"
            fill={`url(#${uid})`}
          />
        )}
        {motif === 0 ? <path d="M10 14h28l-8 22H18Z" fill="rgba(255,255,255,0.14)" /> : null}
        {motif === 1 ? <path d="M24 8 40 22H8Z" fill="rgba(255,255,255,0.16)" /> : null}
        {motif === 2 ? <rect x="22" y="8" width="4" height="30" rx="1" fill="rgba(255,255,255,0.2)" /> : null}
        {motif === 3 ? (
          <circle cx="24" cy="20" r="7" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
        ) : null}
        {motif === 4 ? (
          <path d="M16 16h16v4H28v12h-8V20h-4Z" fill="rgba(255,255,255,0.18)" />
        ) : null}
        {motif === 5 ? (
          <path d="M12 30h24l-4 8H16Z" fill="rgba(0,0,0,0.18)" />
        ) : null}
        <text
          x="24"
          y={shape === "shield" ? 29 : 28}
          textAnchor="middle"
          fill={ink}
          fontSize={crest.initials.length > 2 ? 9 : 11}
          fontWeight="650"
          letterSpacing="-0.04em"
          fontFamily="var(--font-sans), system-ui, sans-serif"
        >
          {crest.initials}
        </text>
      </svg>
    </span>
  );
}

export function AssetMark({ id, className = "h-9 w-9" }: { id: string; className?: string }) {
  const marks: Record<string, { bg: string; fg: string; label: string }> = {
    btc: { bg: "#f7931a", fg: "#fff", label: "₿" },
    spy: { bg: "#0f2c5c", fg: "#fff", label: "SP" },
    tsla: { bg: "#102951", fg: "#e82127", label: "T" },
    amzn: { bg: "#232f3e", fg: "#ff9900", label: "a" },
    eth: { bg: "#627eea", fg: "#fff", label: "Ξ" },
    ost: { bg: "#111827", fg: "#f59e0b", label: "Ø" },
    spx: { bg: "#102951", fg: "#fff", label: "X" },
    fed: { bg: "#1e3a5f", fg: "#fff", label: "F" },
  };
  const mark = marks[id] ?? { bg: "#182d4a", fg: "#fff", label: id.slice(0, 1).toUpperCase() };
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold tracking-[-0.04em] ${className}`}
      style={{ background: mark.bg, color: mark.fg }}
      aria-hidden
    >
      {mark.label}
    </span>
  );
}

export function LeagueMark({ id }: { id: string }) {
  if (id === "ucl") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0b1c4a] text-[9px] font-semibold tracking-wide text-[#265bff]">
        ★
      </span>
    );
  }
  if (id === "epl") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#38003c] text-[8px] font-bold text-white">
        PL
      </span>
    );
  }
  if (id === "gdl-open") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#123a8a] text-[8px] font-bold text-white">
        GDL
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#265bff] text-[9px] font-semibold text-white">
      {id.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Marks sections rendered from the static sample feed (not live data). */
export function SampleBadge() {
  return (
    <span className="rounded-full bg-[#f8fbff] px-2 py-0.5 text-[10px] font-medium tracking-[0.12em] text-[#65758b] uppercase">
      Sample data
    </span>
  );
}

export function SectionHead({
  title,
  count,
  extra,
  sample,
}: {
  title: string;
  count?: number;
  extra?: ReactNode;
  sample?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[18px] font-semibold tracking-[-0.03em] text-[#182d4a] sm:text-[20px]">
        {title}
        {typeof count === "number" ? (
          <span className="text-[13px] font-medium tracking-normal text-[#65758b]">({count})</span>
        ) : null}
        <ChevronRight className="h-4 w-4 text-[#dce5f1]" />
        {sample ? <SampleBadge /> : null}
      </h2>
      {extra}
    </div>
  );
}

export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-1 text-[13px] font-medium text-[#65758b]">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 transition ${
              active ? "bg-white text-[#182d4a] shadow-[0_1px_2px_rgba(24,45,74,0.08)]" : "hover:text-[#182d4a]"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function HorizontalRail({ children }: { children: ReactNode }) {
  const rail = useRail();
  return (
    <div className="relative">
      <RailTrack railRef={rail.ref}>{children}</RailTrack>
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden items-center sm:flex">
        <div className="pointer-events-auto flex gap-1.5">
          <RailButtons onPrev={rail.onPrev} onNext={rail.onNext} />
        </div>
      </div>
    </div>
  );
}

export function RailButtons({
  onPrev,
  onNext,
}: {
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        aria-label="Scroll left"
        onClick={onPrev}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-[#dce5f1] bg-white text-[#65758b] transition hover:border-[#bed2f4] hover:text-[#182d4a]"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Scroll right"
        onClick={onNext}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-[#dce5f1] bg-white text-[#65758b] transition hover:border-[#bed2f4] hover:text-[#182d4a]"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useRail() {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: -1 | 1) => {
    ref.current?.scrollBy({ left: dir * 360, behavior: "smooth" });
  };
  return {
    ref,
    onPrev: () => scroll(-1),
    onNext: () => scroll(1),
  };
}

export function RailTrack({
  railRef,
  children,
}: {
  railRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <div
      ref={railRef}
      className="flex w-full min-w-0 gap-3.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </div>
  );
}

export const cardClass =
  "rounded-[18px] border border-[#dce5f1] bg-white shadow-[0_1px_2px_rgba(24,45,74,0.04)] transition duration-200 hover:border-black/[0.12] hover:shadow-[0_14px_36px_-20px_rgba(24,45,74,0.35)]";

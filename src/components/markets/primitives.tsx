"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import type { Crest } from "@/lib/market-feed";

export function CrestMark({
  crest,
  size = "md",
}: {
  crest: Crest;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? "h-12 w-12 text-[15px]" : size === "sm" ? "h-7 w-7 text-[9px]" : "h-9 w-9 text-[11px]";
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-medium tracking-[-0.03em] text-white ${dim}`}
      style={{ background: crest.color }}
      aria-hidden
    >
      {crest.initials}
      {crest.flag ? (
        <span className="absolute -right-0.5 -bottom-0.5 text-[11px] leading-none">{crest.flag}</span>
      ) : null}
    </span>
  );
}

export function SectionHead({
  title,
  count,
  href,
  extra,
}: {
  title: string;
  count?: number;
  href?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-serif text-[22px] tracking-[-0.03em] text-[#1a1a1a] sm:text-[24px]">
        {href ? (
          <a href={href} className="text-inherit no-underline hover:opacity-70">
            {title}
          </a>
        ) : (
          title
        )}
        {typeof count === "number" ? (
          <span className="font-sans text-[13px] font-normal tracking-normal text-[#9a9a9a]">
            ({count} total)
          </span>
        ) : null}
        <span className="text-[16px] text-[#c8c4bc]">›</span>
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
    <div className="flex items-center gap-1 overflow-x-auto text-[13px] text-[#8a8a8a]">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 transition ${
              active ? "bg-white text-[#1a1a1a] shadow-[0_1px_0_rgba(26,26,26,0.06)]" : "hover:text-[#1a1a1a]"
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
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: -1 | 1) => {
    ref.current?.scrollBy({ left: dir * 340, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={ref}
        className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden items-center gap-2 sm:flex">
        <div className="pointer-events-auto flex gap-1.5">
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scroll(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(26,26,26,0.1)] bg-white text-[#5a5a5a] shadow-sm"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scroll(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(26,26,26,0.1)] bg-white text-[#5a5a5a] shadow-sm"
          >
            ›
          </button>
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
        className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(26,26,26,0.1)] bg-white text-[#5a5a5a]"
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="Scroll right"
        onClick={onNext}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(26,26,26,0.1)] bg-white text-[#5a5a5a]"
      >
        ›
      </button>
    </div>
  );
}

export function useRail() {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: -1 | 1) => {
    ref.current?.scrollBy({ left: dir * 340, behavior: "smooth" });
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
      className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </div>
  );
}

export const cardClass =
  "rounded-2xl border border-[rgba(26,26,26,0.08)] bg-white shadow-[0_8px_24px_-20px_rgba(26,26,26,0.35)]";

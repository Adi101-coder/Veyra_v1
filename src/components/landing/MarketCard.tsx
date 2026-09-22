"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { categoryLabel, type Market } from "@/lib/markets";

function spark(seed: string) {
  let h = 2166136261;
  const values: number[] = [];
  let v = 40;
  for (let i = 0; i < seed.length; i += 1) h ^= seed.charCodeAt(i);
  for (let i = 0; i < 18; i += 1) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    v = Math.min(88, Math.max(18, v + ((h % 13) - 6)));
    values.push(v);
  }
  return values;
}

function path(values: number[]) {
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 120;
      const y = 36 - ((value - min) / span) * 28;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function MarketCard({ market, index }: { market: Market; index: number }) {
  const reduce = useReducedMotion();
  const yes =
    market.seats.find((seat) => seat.side === "lands")?.chance ?? market.seats[0]?.chance ?? 50;
  const no = Math.max(1, 100 - yes);
  const d = path(spark(market.id));

  return (
    <motion.div
      tabIndex={-1}
      variants={{
        hidden: { opacity: 0, y: 22 },
        show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
      }}
      whileHover={reduce ? undefined : { y: -6 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        href={`/contract/${market.id}`}
        className="landing-card group block h-full rounded-[24px] border border-[#dce5f1] bg-[#ffffff] p-5 no-underline transition duration-300 hover:border-[#dce5f1] hover:shadow-[0_24px_60px_-36px_rgba(0,0,0,0.85)]"
      >
        <div className="flex items-center justify-between gap-3 text-[11px] tracking-[0.16em] text-[#657da0] uppercase">
          <span>{categoryLabel(market.category)}</span>
          <span>{market.resolvesAt}</span>
        </div>
        <h3 className="mt-4 min-h-[3.4rem] text-[17px] leading-snug font-medium tracking-[-0.02em] text-[#182d4a]">
          {market.title}
        </h3>
        {index % 2 === 0 ? (
          <svg viewBox="0 0 120 40" className="mt-4 h-10 w-full" aria-hidden>
            <motion.path
              d={d}
              fill="none"
              stroke="#536780"
              strokeWidth="1.3"
              initial={reduce ? false : { pathLength: 0, opacity: 0.35 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            />
          </svg>
        ) : (
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full origin-left rounded-full bg-[#dce5f1]"
              initial={reduce ? false : { scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              style={{ width: `${yes}%` }}
            />
          </div>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2 text-[13px]">
          <div className="rounded-2xl border border-[#dce5f1] bg-[#e8f0ff] px-3 py-2.5">
            <p className="text-[10px] tracking-[0.16em] text-[#65758b] uppercase">Yes</p>
            <p className="mt-1 text-[18px] text-[#182d4a]">{yes}¢</p>
          </div>
          <div className="rounded-2xl border border-[#dce5f1] bg-[#e8f0ff] px-3 py-2.5">
            <p className="text-[10px] tracking-[0.16em] text-[#65758b] uppercase">No</p>
            <p className="mt-1 text-[18px] text-[#83a6e9]">{no}¢</p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

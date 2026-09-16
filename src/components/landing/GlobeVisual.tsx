"use client";

import Image from "next/image";
import { useId } from "react";

type GlobeVisualProps = {
  className?: string;
  priority?: boolean;
  sizes?: string;
};

export function GlobeVisual({
  className = "",
  priority = false,
  sizes = "(min-width: 1024px) 720px, 100vw",
}: GlobeVisualProps) {
  const rid = useId().replace(/:/g, "");

  return (
    <div className={`relative h-full w-full [perspective:1100px] ${className}`.trim()}>
      <div
        className="absolute top-1/2 left-1/2 h-[58%] w-[58%] -translate-x-1/2 -translate-y-[48%] overflow-hidden rounded-full"
        aria-hidden
      >
        <Image
          src="/images/hero-orb.png"
          alt=""
          fill
          priority={priority}
          sizes={sizes}
          className="scale-[1.78] object-contain object-center drop-shadow-[0_40px_80px_rgba(0,0,0,0.55)]"
        />
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="nova-globe-ring relative h-[62%] w-[86%]">
          <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full overflow-visible">
            <defs>
              <linearGradient id={`${rid}-metal`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6d737c" stopOpacity="0.15" />
                <stop offset="18%" stopColor="#f4f7fb" stopOpacity="0.95" />
                <stop offset="42%" stopColor="#9aa3ae" stopOpacity="0.35" />
                <stop offset="68%" stopColor="#d8dee6" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#5c636c" stopOpacity="0.12" />
              </linearGradient>
            </defs>
            <ellipse
              cx="200"
              cy="200"
              rx="188"
              ry="188"
              fill="none"
              stroke={`url(#${rid}-metal)`}
              strokeWidth="5"
            />
            <ellipse
              cx="200"
              cy="200"
              rx="176"
              ry="176"
              fill="none"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1.2"
            />
            <ellipse
              cx="200"
              cy="200"
              rx="188"
              ry="188"
              fill="none"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="3.5"
              strokeDasharray="70 1100"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

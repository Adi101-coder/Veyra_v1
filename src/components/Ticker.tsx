"use client";

import { useEffect, useState } from "react";
import { issueNumber, mastheadDate } from "@/lib/site";
import { Shell } from "@/components/Shell";

type RpcHealth = {
  ms: number | null;
  ok: boolean;
  rpc: string;
};

export function Ticker() {
  const [now] = useState(() => new Date());
  const [health, setHealth] = useState<RpcHealth>({
    ms: 210,
    ok: true,
    rpc: "HELIUS",
  });

  useEffect(() => {
    let cancelled = false;

    const ping = async () => {
      try {
        const response = await fetch("/api/rpc-health", { cache: "no-store" });
        const data = (await response.json()) as RpcHealth;
        if (!cancelled) setHealth(data);
      } catch {
        if (!cancelled) setHealth({ ms: null, ok: false, rpc: "HELIUS" });
      }
    };

    ping();
    const id = window.setInterval(ping, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="bg-[#0e0e0c] text-[#d8d1b8]">
      <Shell className="flex items-center justify-between gap-3 py-2 font-mono text-[9.5px] uppercase tracking-[0.12em] sm:text-[10.5px]">
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <span className="whitespace-nowrap">VOL. I · NO. {issueNumber(now)}</span>
          <span className="hidden opacity-40 sm:inline">·</span>
          <span className="whitespace-nowrap">{mastheadDate(now)}</span>
        </div>
        <div className="hidden items-center gap-[18px] sm:flex">
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                health.ok
                  ? "bg-[#7bc081] shadow-[0_0_0_2px_rgba(123,192,129,0.18)]"
                  : "bg-[#c46060] shadow-[0_0_0_2px_rgba(196,96,96,0.18)]"
              }`}
            />
            <span>
              RPC {health.rpc} · {health.ms != null ? `${health.ms}MS` : "--"}
            </span>
          </div>
          <span>MAINNET ALPHA</span>
        </div>
      </Shell>
    </div>
  );
}

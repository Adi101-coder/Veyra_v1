"use client";

import { useEffect, useState } from "react";

/** Time left in the round. The worker closes it, so this is display only. */
export function Countdown({ closesAt }: { closesAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = Math.max(0, new Date(closesAt).getTime() - now);
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const pad = (value: number) => String(value).padStart(2, "0");

  return (
    <div className="text-right">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">
        {remaining > 0 ? "Closes in" : "Closing"}
      </p>
      <p className="mt-1 font-mono text-[22px] tracking-[-0.02em] text-[#1a1a1a] tabular-nums">
        {remaining > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : "—"}
      </p>
    </div>
  );
}

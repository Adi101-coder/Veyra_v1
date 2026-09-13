"use client";

import { useState } from "react";
import { IconChevron, IconCopy, IconLink } from "@/components/icons";
import { siteConfig } from "@/lib/site";

export function TokenContractCard() {
  const [copied, setCopied] = useState(false);

  const copyMint = async () => {
    try {
      await navigator.clipboard.writeText(siteConfig.social.mint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="rounded-[14px] border border-dashed border-[#4a4a4a] p-5 transition-[box-shadow] duration-160 hover:shadow-[0_8px_22px_rgba(0,0,0,0.08)] sm:p-6"
      style={{ background: "linear-gradient(180deg, #f5f5f5 0%, #ececec 100%)" }}
    >
      <div className="flex items-center gap-5">
        <div
          aria-hidden
          className="flex h-12 w-12 min-w-12 items-center justify-center rounded-full border border-[#4a4a4a] bg-[#f5f5f5] text-[#4a4a4a]"
        >
          <IconLink className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a8a8a]">
            Token Contract
          </p>
          <h3 className="mb-1 font-serif text-[20px] font-normal tracking-[0.01em] text-[#2a2a2a] sm:text-[22px]">
            Pump.fun
          </h3>
          <p className="font-mono text-xs text-[#4a4a4a]">
            Trade or track on pump.fun
          </p>
        </div>
        <a
          href={siteConfig.social.pumpfun}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-2 rounded-full border border-[#cfcfcf] bg-white px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4a4a4a] no-underline transition duration-160 hover:border-[#4a4a4a] hover:text-[#2a2a2a] [&_svg]:transition-transform [&_svg]:duration-160 hover:[&_svg]:translate-x-0.5"
        >
          View
          <IconChevron className="h-3 w-3" />
        </a>
      </div>

      <button
        type="button"
        onClick={copyMint}
        className="mt-4 flex w-full cursor-pointer items-center gap-3 rounded-[10px] border border-dashed border-[#cfcfcf] bg-white px-3.5 py-3 transition-colors duration-160 hover:border-[#4a4a4a] hover:bg-[#f5f5f5]"
      >
        <span className="flex-1 overflow-hidden text-left font-mono text-[13px] text-ellipsis whitespace-nowrap text-[#2a2a2a]">
          {siteConfig.social.mint}
        </span>
        <span
          className={`flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] ${
            copied ? "text-[#63A46C]" : "text-[#4a4a4a]"
          }`}
        >
          <IconCopy className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy"}
        </span>
      </button>
    </div>
  );
}

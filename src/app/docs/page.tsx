import type { Metadata } from "next";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "Documentation",
};

export default function DocsPage() {
  return (
    <Shell className="py-16 sm:py-24">
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#7b7b7b]">
        {"// Resources"}
      </p>
      <h1 className="mt-3 font-serif text-4xl font-light tracking-[0.04em] text-[#222]">
        Documentation
      </h1>
      <p className="mt-5 max-w-xl text-base leading-7 text-[#656565]">
        Protocol docs ship with Mainnet Beta. Until then, the landing page is
        the boarding brief: write a contract, stake a confidence, let the
        scoring rule settle the rest.
      </p>
    </Shell>
  );
}

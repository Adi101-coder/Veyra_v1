"use client";

import { Footer } from "@/components/landing/Footer";
import { Navbar } from "@/components/landing/Navbar";

export function MarketingChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-root relative min-h-screen min-w-0 overflow-x-clip bg-[#f8fbff] text-[#182d4a] selection:bg-[#e8f0ff] selection:text-[#182d4a]">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

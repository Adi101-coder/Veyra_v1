"use client";

import { Footer } from "@/components/landing/Footer";
import { Navbar } from "@/components/landing/Navbar";

export function MarketingChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-root relative min-h-screen bg-[#050505] text-[#f5f5f5] selection:bg-white/15 selection:text-white">
      <span className="landing-noise pointer-events-none fixed inset-0 z-40" aria-hidden />
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

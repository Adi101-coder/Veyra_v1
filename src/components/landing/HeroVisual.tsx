"use client";

import { motion, useReducedMotion } from "framer-motion";
import { GlobeVisual } from "@/components/landing/GlobeVisual";

export function HeroVisual() {
  const reduce = useReducedMotion();

  return (
    <div className="relative mx-auto -mb-24 mt-10 h-[340px] w-full max-w-[720px] sm:-mb-32 sm:mt-14 sm:h-[460px] lg:-mb-40 lg:h-[560px]">
      <motion.div
        aria-hidden
        className="absolute inset-x-[12%] top-[22%] h-[58%] rounded-full bg-[radial-gradient(circle,rgba(38,91,255,0.16),transparent_68%)] blur-3xl"
        animate={reduce ? undefined : { opacity: [0.45, 0.8, 0.45], scale: [0.96, 1.04, 0.96] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <GlobeVisual priority sizes="(min-width: 1024px) 720px, 100vw" />
    </div>
  );
}

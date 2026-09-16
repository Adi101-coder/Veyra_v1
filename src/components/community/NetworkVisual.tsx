"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

const nodes = [
  { x: "12%", y: "28%", size: 18, delay: 0 },
  { x: "78%", y: "18%", size: 14, delay: 0.4 },
  { x: "86%", y: "62%", size: 22, delay: 0.8 },
  { x: "18%", y: "72%", size: 16, delay: 1.1 },
  { x: "48%", y: "12%", size: 10, delay: 0.2 },
  { x: "64%", y: "80%", size: 12, delay: 1.4 },
];

export function NetworkVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 36, damping: 18 });
  const y = useSpring(my, { stiffness: 36, damping: 18 });
  const rotateX = useTransform(y, [-30, 30], [5, -5]);
  const rotateY = useTransform(x, [-30, 30], [-7, 7]);
  const shift = useTransform(x, [-30, 30], [-12, 12]);

  return (
    <div
      ref={ref}
      className="relative mx-auto -mb-16 mt-6 h-[300px] w-full max-w-[760px] sm:-mb-24 sm:h-[420px] lg:-mb-28 lg:h-[520px]"
      onMouseMove={(event) => {
        const box = ref.current?.getBoundingClientRect();
        if (!box) return;
        mx.set(((event.clientX - box.left) / box.width - 0.5) * 60);
        my.set(((event.clientY - box.top) / box.height - 0.5) * 60);
      }}
      onMouseLeave={() => {
        mx.set(0);
        my.set(0);
      }}
    >
      <div className="absolute inset-x-[10%] top-[20%] h-[62%] rounded-full bg-[radial-gradient(circle,rgba(90,100,120,0.16),transparent_68%)] blur-3xl" />
      <svg className="absolute inset-0 h-full w-full opacity-50" viewBox="0 0 760 520" aria-hidden>
        <ellipse cx="380" cy="260" rx="210" ry="78" fill="none" stroke="#3a4048" strokeWidth="0.8" />
        <ellipse
          cx="380"
          cy="260"
          rx="160"
          ry="200"
          fill="none"
          stroke="#2c3138"
          strokeWidth="0.7"
          transform="rotate(18 380 260)"
        />
        <ellipse
          cx="380"
          cy="260"
          rx="240"
          ry="70"
          fill="none"
          stroke="#3d4450"
          strokeWidth="0.6"
          transform="rotate(-22 380 260)"
        />
        <line x1="90" y1="150" x2="380" y2="250" stroke="#3a4048" strokeWidth="0.6" />
        <line x1="600" y1="90" x2="400" y2="230" stroke="#3a4048" strokeWidth="0.6" />
        <line x1="660" y1="320" x2="420" y2="280" stroke="#2f353c" strokeWidth="0.6" />
        <line x1="140" y1="380" x2="340" y2="300" stroke="#2f353c" strokeWidth="0.6" />
      </svg>
      {nodes.map((node) => (
        <motion.span
          key={`${node.x}-${node.y}`}
          aria-hidden
          className="absolute rounded-full border border-white/15 bg-white/10 backdrop-blur-sm"
          style={{
            left: node.x,
            top: node.y,
            width: node.size,
            height: node.size,
            boxShadow: "0 0 18px rgba(180,190,205,0.12)",
          }}
          animate={{ opacity: [0.35, 0.85, 0.35], scale: [1, 1.08, 1] }}
          transition={{ duration: 5.5, repeat: Infinity, delay: node.delay, ease: "easeInOut" }}
        />
      ))}
      <div className="relative h-full">
        <GlobeVisual sizes="(min-width: 1024px) 760px, 100vw" />
      </div>
    </div>
  );
}

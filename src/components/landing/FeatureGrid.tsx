"use client";

import { motion } from "framer-motion";
import { Item, Stagger } from "@/components/motion";
import { IconBolt, IconPulse, IconShield } from "@/components/landing/icons";

const features = [
  {
    icon: IconShield,
    title: "Transparent by design",
    body: "Every market, position, and settlement is verifiable on-chain.",
  },
  {
    icon: IconPulse,
    title: "Trade outcomes",
    body: "Turn your view of the future into a tradable position.",
  },
  {
    icon: IconBolt,
    title: "Fast settlement",
    body: "Markets resolve transparently with automated settlement.",
  },
];

export function FeatureGrid() {
  return (
    <section id="insights" className="scroll-mt-24 px-5 py-20 sm:px-8 lg:px-12">
      <Stagger className="mx-auto max-w-[1100px]">
        <Item>
          <h2 className="max-w-[18ch] text-[32px] leading-[1.12] font-light tracking-[-0.04em] text-[#182d4a] sm:text-[44px]">
            Built for the next generation of markets.
          </h2>
        </Item>
        <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((item) => (
            <Item key={item.title}>
              <motion.article
                tabIndex={-1}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border border-transparent p-1 transition duration-200 hover:border-[#dce5f1]"
              >
                <item.icon className="h-5 w-5 text-[#265bff]" />
                <h3 className="mt-5 text-[18px] font-medium tracking-[-0.02em] text-[#182d4a]">
                  {item.title}
                </h3>
                <p className="mt-2 max-w-[28ch] text-[14px] leading-6 text-[#65758b]">{item.body}</p>
              </motion.article>
            </Item>
          ))}
        </div>
      </Stagger>
    </section>
  );
}

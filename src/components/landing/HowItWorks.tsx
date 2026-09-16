"use client";

import { Item, Stagger } from "@/components/motion";

const steps = [
  {
    n: "01",
    title: "Find a market",
    body: "Explore markets covering crypto, finance, technology, culture, and global events.",
  },
  {
    n: "02",
    title: "Take a position",
    body: "Buy YES or NO based on your view of the outcome.",
  },
  {
    n: "03",
    title: "Settle",
    body: "When the outcome is resolved, your position settles automatically.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 px-5 py-24 sm:px-8 lg:px-12">
      <Stagger className="mx-auto max-w-[1100px]">
        <Item>
          <p className="text-[11px] tracking-[0.28em] text-[#8d939c] uppercase">How it works</p>
        </Item>
        <div className="mt-12 grid gap-0 lg:grid-cols-3">
          {steps.map((step, index) => (
            <Item key={step.n}>
              <article
                className={`py-8 lg:px-8 lg:py-0 ${
                  index > 0 ? "border-t border-[#121417] lg:border-t-0 lg:border-l" : ""
                }`}
              >
                <p className="text-[13px] tracking-[0.22em] text-[#6f737c]">{step.n}</p>
                <h3 className="mt-5 text-[24px] font-light tracking-[-0.03em] text-white">
                  {step.title}
                </h3>
                <p className="mt-3 max-w-[28ch] text-[14px] leading-6 text-[#8f939c]">{step.body}</p>
              </article>
            </Item>
          ))}
        </div>
      </Stagger>
    </section>
  );
}

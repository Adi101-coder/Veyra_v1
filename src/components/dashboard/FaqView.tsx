"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { siteConfig, type FaqItem } from "@/lib/site";

const faqs: readonly FaqItem[] = siteConfig.faq;

export function FaqView() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="bg-[#f4f2ed]">
      <Shell className="max-w-3xl pt-8 pb-20">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c45c5c]">
          <Link href="/dashboard" className="text-[#b0b0b0] no-underline hover:text-[#1a1a1a]">
            Dashboard
          </Link>
          <span className="text-[#c8c4bc]"> / </span>
          FAQ
        </p>
        <h1 className="mt-3 font-serif text-[32px] leading-tight tracking-[-0.03em] text-[#1a1a1a] sm:text-[42px]">
          Questions.
        </h1>
        <p className="mt-4 max-w-[34rem] text-[15px] leading-6 text-[#6e6e6e] italic">
          Straight answers on markets, settlement, and who this floor is for.
        </p>

        <div className="mt-10 border-t border-[rgba(26,26,26,0.12)]">
          {faqs.map((item, index) => {
            const isOpen = open === index;
            const link = item.link ?? null;
            return (
              <div key={item.q} className="border-b border-[rgba(26,26,26,0.12)]">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : index)}
                  className="flex w-full cursor-pointer items-center justify-between gap-6 bg-transparent py-5 text-left text-[#1a1a1a] transition-colors hover:text-[#5a5a5a]"
                >
                  <span className="font-serif text-[18px] leading-[1.3] tracking-[-0.02em] sm:text-[20px]">
                    {item.q}
                  </span>
                  <span aria-hidden className="relative h-3.5 w-3.5 shrink-0">
                    <span className="absolute top-1/2 right-0 left-0 mt-[-1px] h-px bg-[#1a1a1a]" />
                    <motion.span
                      className="absolute top-0 bottom-0 left-1/2 ml-[-0.5px] w-px bg-[#1a1a1a]"
                      animate={{ scaleY: isOpen ? 0 : 1 }}
                      transition={{ duration: 0.2 }}
                    />
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.div
                      key="answer"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="max-w-[40rem] pb-6 text-[15px] leading-6 text-[#6e6e6e]">
                        {item.a}
                        {link ? (
                          <>
                            {" "}
                            <Link
                              href={link.href}
                              className="text-[#1a1a1a] underline decoration-[rgba(26,26,26,0.25)] underline-offset-2 hover:decoration-[#1a1a1a]"
                            >
                              {link.label}
                            </Link>
                            .
                          </>
                        ) : null}
                      </p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </Shell>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/motion";
import { siteConfig, type FaqItem } from "@/lib/site";

const faqs: readonly FaqItem[] = siteConfig.faq;
const ease = [0.16, 1, 0.3, 1] as const;

export function LandingFaq() {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="scroll-mt-24 px-5 py-16 sm:px-8 lg:px-12">
      <Reveal className="mx-auto max-w-[800px]">
        <h2 className="text-[32px] font-light tracking-[-0.04em] text-white">{siteConfig.faqTitle}</h2>
        <div className="mt-8 divide-y divide-[#121417] border-y border-[#121417]">
          {faqs.map((item, index) => {
            const isOpen = open === index;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : index)}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left text-[16px] text-[#f5f5f5]"
                >
                  {item.q}
                  <motion.span
                    aria-hidden
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={{ duration: 0.22, ease }}
                    className="inline-flex text-[22px] leading-none text-[#7d818a]"
                  >
                    +
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.div
                      initial={reduce ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.32, ease }}
                      className="overflow-hidden"
                    >
                      <p className="pb-5 text-[14px] leading-6 text-[#8f939c]">
                        {item.a}
                        {item.link ? (
                          <>
                            {" "}
                            <Link
                              href={item.link.href}
                              className="text-[#d7d7d7] underline-offset-2 hover:underline"
                            >
                              {item.link.label}
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
      </Reveal>
    </section>
  );
}

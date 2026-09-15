"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Reveal } from "@/components/motion";
import { Shell } from "@/components/Shell";
import { siteConfig, type FaqItem } from "@/lib/site";

const faqs: readonly FaqItem[] = siteConfig.faq;

export function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (window.location.hash !== "#faq") return;
    document.getElementById("faq")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <section id="faq" className="scroll-mt-[120px] pt-16 pb-12 sm:pt-20 sm:pb-16">
      <Shell>
        <div className="mx-auto max-w-[880px]">
          <Reveal>
            <h2 className="mb-4 font-serif text-[28px] tracking-[-0.02em] text-[#1a1a1a] sm:mb-6 sm:text-[32px]">
              {siteConfig.faqTitle}
            </h2>
          </Reveal>
          <div className="border-b border-[rgba(26,26,26,0.14)]">
            {faqs.map((item, index) => {
              const isOpen = open === index;
              const link = item.link ?? null;
              return (
                <div
                  key={item.q}
                  className="border-t border-[rgba(26,26,26,0.14)]"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : index)}
                    className="flex w-full cursor-pointer items-center justify-between gap-6 bg-transparent py-5 text-left text-[#5a5a5a] transition-colors duration-160 hover:text-accent"
                  >
                    <span className="text-base font-medium leading-[1.3] tracking-[-0.005em] sm:text-lg">
                      {item.q}
                    </span>
                    <span aria-hidden className="relative h-4 w-4 shrink-0">
                      <span className="absolute top-1/2 right-0 left-0 mt-[-1px] h-0.5 bg-accent" />
                      <motion.span
                        className="absolute top-0 bottom-0 left-1/2 ml-[-1px] w-0.5 bg-accent"
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
                        <p className="ml-2 max-w-[720px] pb-6 pr-0 text-sm leading-[1.65] text-[#6e6e6e] sm:pr-10">
                          {item.a}
                          {link ? (
                            <>
                              {" "}
                              <a
                                href={link.href}
                                {...(link.href.startsWith("http")
                                  ? { target: "_blank", rel: "noreferrer" }
                                  : {})}
                                className="font-semibold text-accent underline-offset-2 hover:underline"
                              >
                                {link.label}
                              </a>
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
        </div>
      </Shell>
    </section>
  );
}

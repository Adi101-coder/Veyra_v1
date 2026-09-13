"use client";

import { useState } from "react";
import { Shell } from "@/components/Shell";
import { siteConfig } from "@/lib/site";

export function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="scroll-mt-[120px] pt-16 pb-12 sm:pt-20 sm:pb-16">
      <Shell>
        <div className="mx-auto max-w-[880px]">
          <h2 className="mb-4 text-base font-semibold tracking-[-0.03em] text-[#7b7b7b] sm:mb-6 sm:text-2xl">
            Frequently Asked Questions.
          </h2>
          <div className="border-b border-[rgba(20,20,20,0.10)]">
            {siteConfig.faq.map((item, index) => {
              const isOpen = open === index;
              return (
                <div
                  key={item.q}
                  className="border-t border-[rgba(20,20,20,0.10)]"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : index)}
                    className="flex w-full cursor-pointer items-center justify-between gap-6 bg-transparent py-5 text-left text-[#656565] transition-colors duration-160 hover:text-[#222]"
                  >
                    <span className="text-base font-medium leading-[1.3] tracking-[-0.005em] sm:text-lg">
                      {item.q}
                    </span>
                    <span
                      aria-hidden
                      className="relative h-4 w-4 shrink-0"
                    >
                      <span className="absolute top-1/2 right-0 left-0 h-0.5 -mt-px bg-[#7b7b7b]" />
                      <span
                        className={`absolute top-0 bottom-0 left-1/2 w-0.5 -ml-px bg-[#7b7b7b] transition-transform duration-200 ${
                          isOpen ? "scale-y-0" : "scale-y-100"
                        }`}
                      />
                    </span>
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows] duration-240 ${
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="ml-2 max-w-[720px] pb-6 pr-0 text-sm leading-[1.65] text-[#7b7b7b] sm:pr-10">
                        {item.q === "When does it launch?" ? (
                          <>
                            Our Mainnet Alpha MVP was launched on June 21st,
                            2026 after the completion of our second third-party{" "}
                            <a
                              href={siteConfig.audit}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-[#656565] underline-offset-2 hover:underline"
                            >
                              security audit
                            </a>
                            , and can be safely used by anyone with a Solana
                            wallet. Onward to Mainnet Beta! Follow along on X or
                            Discord for the next boarding call.
                          </>
                        ) : (
                          item.a
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Shell>
    </section>
  );
}

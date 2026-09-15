import type { Metadata } from "next";
import { Item, Reveal, Stagger } from "@/components/motion";
import { Shell } from "@/components/Shell";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Docs",
};

export default function DocsPage() {
  return (
    <Shell className="py-16 sm:py-24">
      <Reveal>
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
          {siteConfig.docs.kicker}
        </p>
        <h1 className="mt-3 font-serif text-4xl font-light tracking-[-0.02em] text-[#1a1a1a]">
          {siteConfig.docs.title}
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-[#5a5a5a]">
          {siteConfig.docs.body}
        </p>
      </Reveal>

      <Stagger className="mt-12 max-w-[720px] border-t border-[rgba(26,26,26,0.14)]">
        {siteConfig.docs.steps.map((step) => (
          <Item key={step.n}>
            <article className="border-b border-[rgba(26,26,26,0.14)] py-7">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
                Step {step.n}
              </p>
              <h2 className="mt-2 font-serif text-[22px] tracking-[-0.02em] text-[#1a1a1a] sm:text-[26px]">
                {step.title}
              </h2>
              <p className="mt-2 max-w-[520px] text-sm leading-[1.7] text-[#5a5a5a]">
                {step.body}
              </p>
            </article>
          </Item>
        ))}
      </Stagger>
    </Shell>
  );
}

import Image from "next/image";
import { Shell } from "@/components/Shell";
import { siteConfig } from "@/lib/site";

export function Rules() {
  return (
    <section className="py-10 sm:py-12 lg:py-24">
      <Shell>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.28em] text-[#222] sm:mb-3 sm:text-[11px]">
          {"// What to expect"}
        </p>
        <h2 className="rb-reveal mb-3 max-w-[960px] text-xs leading-[1.04] tracking-[-0.015em] text-[#222] sm:mb-4 sm:text-2xl">
          <span className="font-medium text-[#656565]">Riverboat.</span> A
          pilot, a wheel, and a scoring rule.
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {siteConfig.rules.map((rule) => (
            <article
              key={rule.n}
              className="group relative flex flex-col items-center bg-white px-[1.1rem] pt-[1.1rem] pb-5 text-center shadow-[0_6px_18px_-14px_rgba(20,20,20,0.12),0_1px_4px_rgba(20,20,20,0.025)] transition duration-320 hover:-translate-y-[3px] hover:border-[rgba(20,20,20,0.18)] hover:shadow-[0_18px_36px_-18px_rgba(20,20,20,0.22),0_3px_10px_rgba(20,20,20,0.05)] sm:px-5 sm:pt-5"
              style={{ border: "1px solid rgba(20,20,20,0.10)" }}
            >
              <span
                aria-hidden
                className="absolute top-0 right-[12%] left-[12%] h-0.5 origin-center scale-x-0 bg-[#b24a47] opacity-0 transition duration-500 group-hover:scale-x-100 group-hover:opacity-[0.85]"
              />
              <div className="mb-2.5 flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-[5px] w-[5px] rounded-full bg-[#b24a47] opacity-[0.85]"
                />
                <p className="font-mono text-[9.5px] uppercase tracking-[0.32em] text-[#7b7b7b] sm:text-[10.5px]">
                  Rule {rule.n}
                </p>
              </div>
              <div className="relative mb-3 flex h-20 w-full items-center justify-center sm:mb-3.5 sm:h-[92px] lg:h-[104px]">
                <Image
                  src={rule.icon}
                  alt={rule.alt}
                  width={160}
                  height={120}
                  className="relative max-h-full w-auto object-contain mix-blend-multiply grayscale contrast-108"
                />
              </div>
              <h3 className="text-[15px] font-medium tracking-[-0.03em] text-[#222] sm:text-base">
                {rule.title}
              </h3>
              <p className="mt-3 text-[13px] leading-[1.45] font-light text-[#7b7b7b]">
                {rule.body}
              </p>
            </article>
          ))}
        </div>
      </Shell>
    </section>
  );
}

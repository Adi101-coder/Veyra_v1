"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/motion";
import { IconArrowRight } from "@/components/landing/icons";
import { PremiumButton } from "@/components/landing/PremiumButton";

export function CTASection({
  id,
  title,
  body,
  href,
  label,
  image,
}: {
  id?: string;
  title: string;
  body: string;
  href: string;
  label: string;
  image: string;
}) {
  const reduce = useReducedMotion();

  return (
    <section id={id} className="relative px-4 py-16 sm:px-6 lg:px-10">
      <Reveal className="landing-card relative mx-auto min-h-[280px] max-w-[1280px] overflow-hidden rounded-[28px] border border-[#dce5f1] bg-[#ffffff] px-6 py-16 sm:min-h-[320px] sm:px-12 sm:py-20">
        <motion.div
          className="pointer-events-none absolute inset-0"
          animate={reduce ? undefined : { x: [0, 12, 0], y: [0, -8, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        >
          <Image
            src={image}
            alt=""
            fill
            sizes="1280px"
            className="object-contain object-right opacity-70"
          />
        </motion.div>
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#f8fbff_8%,rgba(5,5,5,0.62)_52%,transparent_100%)]" />
        <div className="relative z-10 flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
          <div className="max-w-[34rem]">
            <h2 className="whitespace-pre-line text-[36px] leading-[1.08] font-light tracking-[-0.04em] text-[#182d4a] sm:text-[52px]">
              {title}
            </h2>
            <p className="mt-5 max-w-[28rem] text-[16px] leading-7 text-[#65758b]">{body}</p>
          </div>
          <PremiumButton href={href}>
            {label}
            <IconArrowRight className="h-4 w-4" />
          </PremiumButton>
        </div>
      </Reveal>
    </section>
  );
}

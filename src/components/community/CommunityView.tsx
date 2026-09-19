"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Item, Reveal, Stagger, motion } from "@/components/motion";
import { NetworkVisual } from "@/components/community/NetworkVisual";
import {
  IconArrowRight,
  IconBolt,
  IconCalendar,
  IconCode,
  IconDiscord,
  IconGithub,
  IconMessage,
  IconPulse,
  IconSend,
  IconX,
} from "@/components/landing/icons";
import {
  communityActivity,
  communityChannels,
  communityEvents,
  communityPeople,
  communityStats,
} from "@/lib/community";

const channelIcons = {
  discord: IconDiscord,
  x: IconX,
  telegram: IconSend,
  github: IconGithub,
} as const;

const activityIcons = [IconPulse, IconMessage, IconBolt, IconCode];

function CountUp({
  value,
  decimals,
  suffix,
}: {
  value: number;
  decimals: number;
  suffix: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const write = (text: string) => {
      node.textContent = `${text}${suffix}`;
    };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      write(value.toFixed(decimals));
      return;
    }

    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / 1100);
          const eased = 1 - (1 - t) ** 3;
          write((value * eased).toFixed(decimals));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    write("0");
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [decimals, suffix, value]);

  return <span ref={ref} />;
}

export function CommunityView() {
  return (
    <div>
      <section className="relative overflow-hidden px-5 pt-24 pb-4 sm:px-8 sm:pt-36 lg:px-12 lg:pt-40">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(70,78,92,0.16),transparent_70%)]" />
        <Reveal className="relative mx-auto max-w-[860px] text-center">
          <p className="text-[11px] font-medium tracking-[0.28em] text-[#8d939c] uppercase">
            The VEYRA community
          </p>
          <h1 className="mt-6 bg-[linear-gradient(180deg,#ffffff_0%,#f5f5f5_42%,#9aa0a6_100%)] bg-clip-text text-[44px] leading-[1.02] font-light tracking-[-0.045em] text-transparent sm:text-[72px] lg:text-[88px]">
            Built by traders.
            <br />
            Shaped by the community.
          </h1>
          <p className="mx-auto mt-7 max-w-[34rem] text-[16px] leading-7 text-[#9a9ea8] sm:text-[18px]">
            Connect with traders, builders, researchers, and market enthusiasts building the future
            of on-chain markets.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="#discord"
              className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(180deg,#f3f3f3,#c9ccd1)] px-7 text-[15px] font-medium text-[#111] no-underline sm:w-auto"
            >
              Join Discord
              <IconArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="#x"
              className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/15 px-7 text-[15px] font-medium text-white no-underline transition hover:border-white/30 sm:w-auto"
            >
              Follow on X
              <IconX className="h-4 w-4 transition group-hover:-translate-y-0.5" />
            </Link>
          </div>
          <p className="mt-6 text-[13px] tracking-[-0.01em] text-[#6f737c]">
            Join thousands of traders and builders.
          </p>
        </Reveal>
        <NetworkVisual />
      </section>

      <section id="channels" className="relative z-10 scroll-mt-24 px-4 pb-6 sm:px-6 lg:px-10">
        <Reveal className="mx-auto max-w-[1280px] rounded-[28px] border border-[#121417] bg-[#0b0c0e]/90 px-5 py-10 backdrop-blur-md sm:px-8 sm:py-12">
          <h2 className="text-[32px] font-light tracking-[-0.04em] text-white sm:text-[44px]">
            Find your people.
          </h2>
          <p className="mt-3 text-[16px] text-[#8f939c]">Choose where you want to connect.</p>
          <Stagger className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {communityChannels.map((channel) => {
              const Icon = channelIcons[channel.id];
              return (
                <Item key={channel.id}>
                  <motion.article
                    id={channel.id}
                    whileHover={{ y: -2, borderColor: "rgba(255,255,255,0.16)" }}
                    className="group flex h-full scroll-mt-28 flex-col rounded-[24px] border border-[#121417] bg-[#0b0c0e] p-6"
                  >
                    <Icon className="h-5 w-5 text-[#c5c8ce] transition group-hover:-translate-y-0.5" />
                    <p className="mt-5 text-[11px] tracking-[0.2em] text-[#6f737c] uppercase">
                      {channel.name}
                    </p>
                    <p className="mt-3 text-[14px] leading-6 text-[#b8bcc4]">{channel.description}</p>
                    <p className="mt-5 text-[12px] text-[#6f737c]">{channel.members}</p>
                    <Link
                      href={channel.href}
                      className="mt-auto inline-flex items-center gap-1 pt-6 text-[14px] text-[#d7dbe2] no-underline transition group-hover:text-white"
                    >
                      {channel.cta}
                      <IconArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </Link>
                  </motion.article>
                </Item>
              );
            })}
          </Stagger>
        </Reveal>
      </section>

      <section className="px-5 py-16 sm:px-8 lg:px-12">
        <Stagger className="mx-auto grid max-w-[1280px] grid-cols-2 gap-y-10 lg:grid-cols-4">
          {communityStats.map((stat) => (
            <Item key={stat.label}>
              <p className="text-[40px] leading-none font-extralight tracking-[-0.05em] text-white sm:text-[56px] lg:text-[64px]">
                <CountUp value={stat.value} decimals={stat.decimals} suffix={stat.suffix} />
              </p>
              <p className="mt-3 text-[13px] text-[#8f939c]">{stat.label}</p>
            </Item>
          ))}
        </Stagger>
      </section>

      <section className="px-5 py-8 sm:px-8 lg:px-12">
        <Reveal className="mx-auto max-w-[800px]">
          <h2 className="text-[32px] font-light tracking-[-0.04em] text-white sm:text-[40px]">
            What&apos;s happening
          </h2>
          <Stagger className="mt-8 divide-y divide-[#121417] border-y border-[#121417]">
            {communityActivity.map((item, index) => {
              const Icon = activityIcons[index];
              return (
                <Item key={item.title}>
                  <article className="flex gap-4 py-6">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-[#c5c8ce]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="text-[11px] tracking-[0.16em] text-[#6f737c] uppercase">
                          {item.kind}
                        </p>
                        <p className="text-[12px] text-[#5c616a]">{item.time}</p>
                      </div>
                      <h3 className="mt-1 text-[17px] tracking-[-0.02em] text-white">{item.title}</h3>
                      <p className="mt-1 text-[14px] leading-6 text-[#8f939c]">{item.body}</p>
                    </div>
                  </article>
                </Item>
              );
            })}
          </Stagger>
        </Reveal>
      </section>

      <section className="px-4 py-10 sm:px-6 lg:px-10">
        <Reveal className="mx-auto flex max-w-[1280px] flex-col justify-between gap-10 overflow-hidden rounded-[28px] border border-[#121417] bg-[#0b0c0e] px-6 py-12 sm:px-10 lg:flex-row lg:items-center">
          <div className="max-w-[32rem]">
            <h2 className="text-[32px] leading-[1.1] font-light tracking-[-0.04em] text-white sm:text-[44px]">
              Meet the people building the future.
            </h2>
            <p className="mt-4 text-[16px] leading-7 text-[#8f939c]">
              From traders and analysts to developers and researchers, VEYRA is powered by an open
              community.
            </p>
            <Link
              href="#channels"
              className="group mt-8 inline-flex items-center gap-1 text-[14px] text-[#d7dbe2] no-underline hover:text-white"
            >
              Explore the community
              <IconArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="flex items-center">
            {communityPeople.map((person, index) => (
              <span
                key={person.initials}
                title={person.label}
                className="flex h-14 w-14 items-center justify-center rounded-full border border-[#121417] bg-[#16181c] text-[12px] tracking-[0.12em] text-[#d7dbe2]"
                style={{ marginLeft: index === 0 ? 0 : -12, zIndex: communityPeople.length - index }}
              >
                {person.initials}
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      <section id="events" className="scroll-mt-24 px-5 py-10 sm:px-8 lg:px-12">
        <Reveal className="mx-auto max-w-[1280px]">
          <h2 className="text-[32px] font-light tracking-[-0.04em] text-white sm:text-[40px]">
            Community events
          </h2>
          <Stagger className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {communityEvents.map((event) => (
              <Item key={event.n}>
                <motion.article
                  whileHover={{ y: -2, borderColor: "rgba(255,255,255,0.16)" }}
                  className="flex h-full flex-col rounded-[24px] border border-[#121417] bg-[#0b0c0e] p-6"
                >
                  <div className="flex items-center justify-between text-[12px] text-[#6f737c]">
                    <span className="tracking-[0.18em]">EVENT {event.n}</span>
                    <span className="inline-flex items-center gap-1.5">
                      <IconCalendar className="h-3.5 w-3.5" />
                      {event.cadence}
                    </span>
                  </div>
                  <h3 className="mt-6 text-[22px] font-light tracking-[-0.03em] text-white">
                    {event.title}
                  </h3>
                  <p className="mt-3 text-[14px] leading-6 text-[#8f939c]">{event.body}</p>
                  <Link
                    href="#channels"
                    className="group mt-8 inline-flex items-center gap-1 text-[14px] text-[#d7dbe2] no-underline hover:text-white"
                  >
                    Learn more
                    <IconArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </Link>
                </motion.article>
              </Item>
            ))}
          </Stagger>
        </Reveal>
      </section>

      <section className="relative overflow-hidden px-5 py-24 sm:px-8 lg:px-12">
        <Image
          src="/images/final-orb.png"
          alt=""
          width={520}
          height={520}
          className="pointer-events-none absolute top-1/2 left-1/2 w-[min(640px,90vw)] -translate-x-1/2 -translate-y-1/2 opacity-25"
        />
        <Reveal className="relative mx-auto max-w-[900px] text-center">
          <p className="text-[36px] leading-[1.1] font-extralight tracking-[-0.045em] text-white sm:text-[56px] lg:text-[68px]">
            Markets are better when everyone can participate.
          </p>
          <p className="mt-8 text-[13px] tracking-[0.22em] text-[#8d939c] uppercase">
            VEYRA Community
          </p>
        </Reveal>
      </section>

      <section className="relative px-4 pb-16 sm:px-6 lg:px-10">
        <Reveal className="relative mx-auto max-w-[1280px] overflow-hidden rounded-[28px] border border-[#121417] bg-[#0b0c0e] px-6 py-16 sm:px-12 sm:py-20">
          <Image
            src="/images/cta-orb.png"
            alt=""
            width={720}
            height={400}
            className="pointer-events-none absolute -right-24 -bottom-28 w-[min(620px,80%)] max-w-none opacity-75"
          />
          <div className="relative z-10 max-w-[36rem]">
            <h2 className="whitespace-pre-line text-[36px] leading-[1.08] font-light tracking-[-0.04em] text-white sm:text-[52px]">
              {"Don't just watch the market.\nJoin it."}
            </h2>
            <p className="mt-5 max-w-[28rem] text-[16px] leading-7 text-[#9a9ea8]">
              Connect with the people building and trading the future of on-chain markets.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="#discord"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[linear-gradient(180deg,#f3f3f3,#c9ccd1)] px-7 text-[15px] font-medium text-[#111] no-underline"
              >
                Join the community
                <IconArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/markets"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-7 text-[15px] font-medium text-white no-underline transition hover:border-white/30"
              >
                Explore markets
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

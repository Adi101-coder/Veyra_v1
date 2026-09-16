"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Item, Reveal, Stagger, motion } from "@/components/motion";
import { CodeBlock } from "@/components/docs/CodeBlock";
import {
  IconArrowRight,
  IconChevronDown,
  IconClose,
  IconMenu,
  IconSearch,
} from "@/components/landing/icons";
import {
  docsNav,
  flattenDocs,
  getArticle,
  neighbors,
  popularDocs,
  versions,
} from "@/lib/docs";

const how = [
  {
    n: "01",
    title: "Discover",
    body: "Browse live markets. Each one is a question about a future outcome, with rules published before the first trade.",
  },
  {
    n: "02",
    title: "Trade",
    body: "Take YES or NO. Size the position to your conviction. The book is the same whether you use the app or the API.",
  },
  {
    n: "03",
    title: "Resolve",
    body: "When the outcome is known, the oracle posts resolution and settlement follows automatically.",
  },
];

const infoCards = [
  {
    id: "markets",
    title: "Markets",
    body: "Explore live markets and discover opportunities.",
  },
  {
    id: "api-overview",
    title: "API",
    body: "Build applications using VEYRA's developer infrastructure.",
  },
  {
    id: "architecture",
    title: "Protocol",
    body: "Understand the contracts, oracle system, and settlement layer.",
  },
];

export function DocsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const page = params.get("page") ?? "introduction";
  const article = getArticle(page);
  const list = useMemo(() => flattenDocs(), []);
  const { prev, next } = neighbors(article.id);

  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [menu, setMenu] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [activeToc, setActiveToc] = useState(article.toc[0]?.id ?? article.id);
  const searchRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return list.filter((item) => item.title.toLowerCase().includes(q)).slice(0, 6);
  }, [list, query]);

  const go = (id: string) => {
    setQuery("");
    setFocused(false);
    setMenu(false);
    router.replace(`${pathname}?page=${id}`, { scroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const ids = article.toc.map((item) => item.id);
    const nodes = ids
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node));
    if (!nodes.length) {
      setActiveToc(article.toc[0]?.id ?? article.id);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveToc(visible.target.id);
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: [0, 0.25, 0.6] },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [article]);

  const Sidebar = ({ onPick }: { onPick?: () => void }) => (
    <div>
      <div className="relative mb-8">
        <button
          type="button"
          onClick={() => setVersionOpen((value) => !value)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#121417] bg-[#0b0c0e] px-3 py-1.5 text-[12px] text-[#cfd5de] transition hover:border-white/15"
        >
          {versions[0]}
          <IconChevronDown className="h-3 w-3 text-[#8f939c]" />
        </button>
        {versionOpen ? (
          <div className="absolute top-[calc(100%+8px)] left-0 z-20 w-28 rounded-xl border border-[#121417] bg-[#0b0c0e] p-1">
            {versions.map((version) => (
              <button
                key={version}
                type="button"
                onClick={() => setVersionOpen(false)}
                className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] text-white"
              >
                {version}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <nav className="flex flex-col gap-7">
        {docsNav.map((group) => (
          <div key={group.heading}>
            <p className="mb-2 text-[11px] tracking-[0.2em] text-[#6f737c] uppercase">
              {group.heading}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = item.id === article.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        go(item.id);
                        onPick?.();
                      }}
                      className={`flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[13.5px] transition duration-200 ${
                        active
                          ? "bg-white/[0.06] text-white"
                          : "text-[#9aa0a8] hover:bg-white/[0.03] hover:text-[#e8e8e8]"
                      }`}
                    >
                      {active ? (
                        <span aria-hidden className="h-1 w-1 rounded-full bg-[#cfd5de]" />
                      ) : (
                        <span aria-hidden className="h-1 w-1 rounded-full bg-transparent" />
                      )}
                      {item.title}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );

  return (
    <div className="relative">
      <section className="relative overflow-hidden px-5 pt-16 pb-10 sm:px-8 sm:pt-24 lg:px-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[48vh] bg-[radial-gradient(55%_45%_at_50%_0%,rgba(70,78,92,0.14),transparent_70%)]" />
        <Reveal className="relative mx-auto max-w-[720px] text-center">
          <p className="text-[11px] font-medium tracking-[0.28em] text-[#8d939c] uppercase">
            Documentation
          </p>
          <h1 className="mt-5 bg-[linear-gradient(180deg,#ffffff_0%,#f5f5f5_42%,#9aa0a6_100%)] bg-clip-text text-[40px] leading-[1.05] font-light tracking-[-0.045em] text-transparent sm:text-[64px] lg:text-[72px]">
            Everything you need
            <br />
            to build on VEYRA.
          </h1>
          <p className="mx-auto mt-6 max-w-[34rem] text-[16px] leading-7 text-[#9a9ea8]">
            Explore the protocol, trading infrastructure, APIs, integrations, and tools powering
            the next generation of on-chain markets.
          </p>
          <div className="relative mx-auto mt-10 max-w-[560px]">
            <label className="sr-only" htmlFor="docs-search">
              Search documentation
            </label>
            <IconSearch className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-[#7d818a]" />
            <input
              id="docs-search"
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => window.setTimeout(() => setFocused(false), 120)}
              placeholder="Search documentation..."
              className="docs-search h-14 w-full rounded-full border border-white/10 bg-[#0b0c0e]/80 pr-16 pl-11 text-[15px] text-white outline-none backdrop-blur-md placeholder:text-[#6f737c] transition"
            />
            <kbd className="absolute top-1/2 right-4 hidden -translate-y-1/2 rounded-md border border-white/10 bg-[#121417] px-1.5 py-0.5 font-mono text-[10px] text-[#8f939c] sm:inline">
              ⌘K
            </kbd>
            {focused && results.length > 0 ? (
              <div className="absolute inset-x-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl border border-[#121417] bg-[#0b0c0e] p-1 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.8)]">
                {results.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onMouseDown={() => go(item.id)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] text-[#cfcfcf] hover:bg-white/5 hover:text-white"
                  >
                    <span>{item.title}</span>
                    <span className="text-[11px] tracking-[0.14em] text-[#6f737c] uppercase">
                      {item.category}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[13px] text-[#8f939c]">
            <span>Popular:</span>
            {popularDocs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[12px] text-[#cfd5de] transition hover:border-white/20 hover:text-white"
              >
                {item.label}
              </button>
            ))}
          </div>
        </Reveal>
      </section>

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-8 px-5 pb-8 sm:px-8 lg:grid-cols-[200px_minmax(0,1fr)] lg:px-12 xl:grid-cols-[220px_minmax(0,1fr)_200px]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
            <Sidebar />
          </div>
        </aside>

        <div>
          <button
            type="button"
            onClick={() => setMenu(true)}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-[13px] text-[#cfd5de] lg:hidden"
          >
            <IconMenu className="h-4 w-4" />
            Documentation menu
          </button>

          <article>
            <p className="text-[13px] text-[#8f939c]">
              Docs <span className="mx-1.5 text-[#4a4e56]">/</span> {article.category}
            </p>
            <p className="mt-5 text-[11px] tracking-[0.22em] text-[#8d939c] uppercase">
              {article.category}
            </p>
            <h2
              id={article.id === "introduction" ? "introduction" : undefined}
              className="mt-3 scroll-mt-28 text-[36px] leading-none font-light tracking-[-0.04em] text-white sm:text-[44px]"
            >
              {article.title}
            </h2>
            <p className="mt-4 max-w-[38rem] text-[16px] leading-7 text-[#9a9ea8]">
              {article.description}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4 text-[12px] text-[#6f737c]">
              <span>Last updated {article.updated}</span>
              <span className="h-1 w-1 rounded-full bg-[#3a3e46]" />
              <span>{versions[0]}</span>
            </div>
            <div className="mt-8 h-px bg-[#121417]" />

            {article.id === "introduction" ? (
              <>
                {article.sections
                  .filter((section) => section.id === "markets-reimagined")
                  .map((section) => (
                    <section key={section.id} id={section.id} className="scroll-mt-28 pt-10">
                      <h3 className="text-[26px] font-light tracking-[-0.03em] text-white sm:text-[30px]">
                        {section.heading}
                      </h3>
                      {section.paragraphs.map((paragraph) => (
                        <p
                          key={paragraph}
                          className="mt-4 max-w-[38rem] text-[15px] leading-7 text-[#9a9ea8]"
                        >
                          {paragraph}
                        </p>
                      ))}
                      <p className="mt-4 max-w-[38rem] text-[15px] leading-7 text-[#9a9ea8]">
                        Install the SDK and you are one{" "}
                        <code className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[13px] text-[#d7dbe2]">
                          Veyra()
                        </code>{" "}
                        call away from live market data.
                      </p>
                      <div className="mt-6">
                        <CodeBlock code={section.code ?? ""} />
                      </div>
                    </section>
                  ))}

                <section id="how-it-works" className="scroll-mt-28 pt-12">
                  <h3 className="text-[26px] font-light tracking-[-0.03em] text-white sm:text-[30px]">
                    How it works
                  </h3>
                  <Stagger className="mt-8 grid gap-6">
                    {how.map((step) => (
                      <Item key={step.n}>
                        <div className="flex gap-5 border-t border-[#121417] pt-6">
                          <p className="w-10 shrink-0 font-mono text-[12px] tracking-[0.18em] text-[#6f737c]">
                            {step.n}
                          </p>
                          <div>
                            <h4 className="text-[18px] font-medium tracking-[-0.02em] text-white">
                              {step.title}
                            </h4>
                            <p className="mt-2 max-w-[36rem] text-[14px] leading-6 text-[#8f939c]">
                              {step.body}
                            </p>
                          </div>
                        </div>
                      </Item>
                    ))}
                  </Stagger>
                </section>

                <section id="trading" className="scroll-mt-28 pt-12">
                  <h3 className="text-[26px] font-light tracking-[-0.03em] text-white sm:text-[30px]">
                    Trading
                  </h3>
                  {article.sections
                    .find((section) => section.id === "trading")
                    ?.paragraphs.map((paragraph) => (
                      <p
                        key={paragraph}
                        className="mt-4 max-w-[38rem] text-[15px] leading-7 text-[#9a9ea8]"
                      >
                        {paragraph}
                      </p>
                    ))}
                </section>

                <section id="settlement" className="scroll-mt-28 pt-12">
                  <h3 className="text-[26px] font-light tracking-[-0.03em] text-white sm:text-[30px]">
                    Settlement
                  </h3>
                  {article.sections
                    .find((section) => section.id === "settlement")
                    ?.paragraphs.map((paragraph) => (
                      <p
                        key={paragraph}
                        className="mt-4 max-w-[38rem] text-[15px] leading-7 text-[#9a9ea8]"
                      >
                        {paragraph}
                      </p>
                    ))}
                </section>

                <Stagger className="mt-12 grid gap-3 sm:grid-cols-3">
                  {infoCards.map((card) => (
                    <Item key={card.id}>
                      <motion.button
                        type="button"
                        onClick={() => go(card.id)}
                        whileHover={{ y: -2, borderColor: "rgba(255,255,255,0.16)" }}
                        className="group flex h-full w-full flex-col rounded-2xl border border-[#121417] bg-[#0b0c0e]/80 p-5 text-left backdrop-blur-md"
                      >
                        <span className="flex items-center justify-between text-[16px] text-white">
                          {card.title}
                          <IconArrowRight className="h-4 w-4 text-[#7d818a] transition group-hover:translate-x-0.5 group-hover:text-white" />
                        </span>
                        <span className="mt-2 text-[13px] leading-6 text-[#8f939c]">{card.body}</span>
                      </motion.button>
                    </Item>
                  ))}
                </Stagger>
              </>
            ) : (
              article.sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-28 pt-10">
                  <h3 className="text-[26px] font-light tracking-[-0.03em] text-white sm:text-[30px]">
                    {section.heading}
                  </h3>
                  {section.paragraphs.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="mt-4 max-w-[38rem] text-[15px] leading-7 text-[#9a9ea8]"
                    >
                      {paragraph}
                    </p>
                  ))}
                  {section.code ? (
                    <div className="mt-6">
                      <CodeBlock
                        code={section.code}
                        lang={section.code.includes("import") ? "ts" : "bash"}
                      />
                    </div>
                  ) : null}
                </section>
              ))
            )}

            <div className="mt-14 grid gap-3 border-t border-[#121417] pt-6 sm:grid-cols-2">
              {prev ? (
                <button
                  type="button"
                  onClick={() => go(prev.id)}
                  className="rounded-2xl border border-[#121417] bg-[#0b0c0e] px-5 py-4 text-left transition hover:border-white/15"
                >
                  <p className="text-[11px] tracking-[0.16em] text-[#6f737c] uppercase">Previous</p>
                  <p className="mt-1 text-[15px] text-white">{prev.title}</p>
                </button>
              ) : (
                <span />
              )}
              {next ? (
                <button
                  type="button"
                  onClick={() => go(next.id)}
                  className="rounded-2xl border border-[#121417] bg-[#0b0c0e] px-5 py-4 text-left transition hover:border-white/15 sm:text-right"
                >
                  <p className="text-[11px] tracking-[0.16em] text-[#6f737c] uppercase">Next</p>
                  <p className="mt-1 text-[15px] text-white">{next.title}</p>
                </button>
              ) : null}
            </div>
          </article>
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-24">
            <p className="text-[11px] tracking-[0.2em] text-[#6f737c] uppercase">On this page</p>
            <ul className="mt-4 flex flex-col gap-1.5">
              {article.toc.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className={`block text-[13px] no-underline transition ${
                      activeToc === item.id ? "text-white" : "text-[#8f939c] hover:text-[#d7dbe2]"
                    }`}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-10 rounded-2xl border border-[#121417] bg-[#0b0c0e] p-5">
              <p className="text-[15px] text-white">Need help?</p>
              <p className="mt-2 text-[13px] leading-6 text-[#8f939c]">
                Join the VEYRA community and talk with other traders and developers.
              </p>
              <Link
                href="/community"
                className="mt-4 inline-flex items-center gap-1 text-[13px] text-[#d7dbe2] no-underline transition hover:text-white"
              >
                Join community
                <IconArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </aside>
      </div>

      <section className="relative px-4 py-10 sm:px-6 lg:px-10">
        <Reveal className="relative mx-auto max-w-[1280px] overflow-hidden rounded-[28px] border border-[#121417] bg-[#0b0c0e] px-6 py-16 sm:px-12 sm:py-20">
          <Image
            src="/images/cta-orb.png"
            alt=""
            width={640}
            height={360}
            className="pointer-events-none absolute -right-16 -bottom-24 w-[min(520px,70%)] max-w-none opacity-70"
          />
          <div className="relative z-10 max-w-[34rem]">
            <h2 className="text-[36px] leading-[1.08] font-light tracking-[-0.04em] text-white sm:text-[52px]">
              Build on the future of markets.
            </h2>
            <p className="mt-5 max-w-[28rem] text-[16px] leading-7 text-[#9a9ea8]">
              Explore the API, integrate VEYRA into your product, or join the community.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => go("api-overview")}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[linear-gradient(180deg,#f3f3f3,#c9ccd1)] px-7 text-[15px] font-medium text-[#111]"
              >
                Read the API docs
                <IconArrowRight className="h-4 w-4" />
              </button>
              <Link
                href="/community"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-7 text-[15px] font-medium text-white no-underline transition hover:border-white/30"
              >
                Join community
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {menu ? (
        <div className="fixed inset-0 z-[70] bg-[#050505]/96 backdrop-blur-sm lg:hidden">
          <div className="flex h-[72px] items-center justify-between px-5">
            <p className="text-[15px] text-white">Documentation</p>
            <button type="button" aria-label="Close documentation menu" onClick={() => setMenu(false)}>
              <IconClose className="h-6 w-6" />
            </button>
          </div>
          <div className="h-[calc(100vh-72px)] overflow-y-auto px-5 pb-10">
            <Sidebar onPick={() => setMenu(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

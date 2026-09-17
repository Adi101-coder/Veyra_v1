"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { categories, categoryColor, categoryLabel, type CategoryId } from "@/lib/markets";
import { Identicon } from "@/components/dashboard/Identicon";
import { Shell } from "@/components/Shell";

const HEADLINE_MAX = 140;
const TERMS_MAX = 8192;
const TAG_MAX = 16;
const TOPIC_CATEGORIES = categories.filter((item) => item.id !== "all");

const TIMEZONES = [
  { id: "Asia/Kolkata", label: "India Time / Calcutta" },
  { id: "UTC", label: "UTC" },
  { id: "America/New_York", label: "Eastern Time / New York" },
  { id: "America/Chicago", label: "Central Time / Chicago" },
  { id: "America/Los_Angeles", label: "Pacific Time / Los Angeles" },
  { id: "Europe/London", label: "London / GMT" },
  { id: "Europe/Paris", label: "Central European / Paris" },
  { id: "Asia/Singapore", label: "Singapore Time" },
  { id: "Asia/Tokyo", label: "Japan Time / Tokyo" },
] as const;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

type TopicId = Exclude<CategoryId, "all">;

function parseWall(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

function formatPreviewStamp(value: string) {
  const parts = parseWall(value);
  if (!parts) return "Set a time";
  const mer = parts.hour >= 12 ? "PM" : "AM";
  const hour = parts.hour % 12 || 12;
  return `${hour}:${String(parts.minute).padStart(2, "0")} ${mer} ${MONTHS[parts.month - 1]} ${parts.day}, ${parts.year}`;
}

function tzOffsetMs(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const bag = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  const asWall = Date.UTC(
    Number(bag.year),
    Number(bag.month) - 1,
    Number(bag.day),
    Number(bag.hour),
    Number(bag.minute),
    Number(bag.second),
  );
  return asWall - date.getTime();
}

function wallToUtc(value: string, timeZone: string) {
  const parts = parseWall(value);
  if (!parts) return null;
  const guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return new Date(guess - tzOffsetMs(new Date(guess), timeZone));
}

function formatUtcLine(value: string, timeZone: string, zoneLabel: string) {
  const utc = wallToUtc(value, timeZone);
  if (!utc) return "";
  const stamp = utc.toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  });
  return `${zoneLabel.split(" / ")[0]} · ${stamp.replace(",", "")} UTC`;
}

export function WriteView() {
  const reduce = useReducedMotion();
  const [headline, setHeadline] = useState("");
  const [terms, setTerms] = useState("");
  const [topics, setTopics] = useState<TopicId[]>([]);
  const [tag, setTag] = useState("");
  const [resolves, setResolves] = useState("2027-01-01T13:29");
  const [timeZone, setTimeZone] = useState("Asia/Kolkata");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [encryptHeadline, setEncryptHeadline] = useState(false);
  const [encryptTerms, setEncryptTerms] = useState(false);
  const [preview, setPreview] = useState(true);
  const [published, setPublished] = useState(false);

  const zoneLabel = TIMEZONES.find((item) => item.id === timeZone)?.label ?? timeZone;
  const checks = useMemo(
    () => [
      { id: "headline", label: "Question written", done: headline.trim().length > 8 },
      { id: "terms", label: "Resolution rules set", done: terms.trim().length > 12 },
      { id: "topic", label: "Category chosen", done: topics.length > 0 },
      { id: "time", label: "Judgment time set", done: Boolean(parseWall(resolves)) },
    ],
    [headline, terms, topics, resolves],
  );
  const ready = checks.every((item) => item.done);
  const canPublish = ready && !published;
  const doneCount = checks.filter((item) => item.done).length;
  const accent = topics[0] ? categoryColor(topics[0]) : "#c4a46a";

  const encryptNote = encryptHeadline && encryptTerms
    ? "Headline and terms are encrypted on-chain."
    : encryptHeadline
      ? "Headline is encrypted. Terms go on-chain in clear."
      : encryptTerms
        ? "Terms are encrypted. The question goes on-chain in clear."
        : "Question and terms publish in clear.";

  const toggleTopic = (id: TopicId) => {
    setTopics((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  return (
    <div className="bg-[#f4f2ed]">
      <Shell className="pt-5 pb-24 sm:pt-7">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-[#8a8a8a]">
            <Link href="/dashboard" className="text-[#5a5a5a] no-underline hover:text-[#1a1a1a]">
              Dashboard
            </Link>
            <span className="text-[#c8c4bc]">/</span>
            <span className="text-[#1a1a1a]">Write a contract</span>
          </p>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[rgba(26,26,26,0.1)] bg-white px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">
              Draft · {doneCount}/{checks.length}
            </span>
            <button
              type="button"
              onClick={() => setPreview((value) => !value)}
              className="rounded-full border border-[rgba(26,26,26,0.12)] bg-white px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#5a5a5a] lg:hidden"
            >
              {preview ? "Hide preview" : "Show preview"}
            </button>
          </div>
        </div>

        <div
          className={`grid items-start gap-6 lg:gap-8 ${
            preview ? "xl:grid-cols-[minmax(0,1fr)_22.5rem]" : ""
          }`}
        >
          <form
            id="write-contract"
            className="min-w-0 overflow-hidden rounded-[24px] border border-[rgba(26,26,26,0.08)] bg-[#fbfaf7] shadow-[0_18px_50px_-36px_rgba(26,26,26,0.35)]"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canPublish) return;
              setPublished(true);
            }}
          >
            <div className="border-b border-[rgba(26,26,26,0.08)] px-5 py-7 sm:px-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c4a46a]">
                New contract
              </p>
              <h1 className="mt-2 font-serif text-[34px] leading-[0.95] tracking-[-0.03em] text-[#1a1a1a] sm:text-[42px]">
                Write a Contract.
              </h1>
              <p className="mt-3 max-w-[36rem] text-[15px] leading-6 text-[#6e6e6e]">
                Frame a question, lock the resolution rules, then list it. Others wager against those
                terms — not against a moving goalpost.
              </p>
              <ol className="mt-6 flex flex-wrap gap-2">
                {[
                  { n: "01", label: "Question", done: checks[0].done },
                  { n: "02", label: "Resolution", done: checks[1].done && checks[3].done },
                  { n: "03", label: "Listing", done: checks[2].done },
                ].map((step) => (
                  <li
                    key={step.n}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] ${
                      step.done
                        ? "bg-[#1a1a1a] text-white"
                        : "border border-[rgba(26,26,26,0.1)] bg-white text-[#8a8a8a]"
                    }`}
                  >
                    <span>{step.n}</span>
                    {step.label}
                  </li>
                ))}
              </ol>
            </div>

            <Field
              n="01"
              title="The question"
              hint="One sentence. State exactly what is being wagered on."
            >
              <div className="rounded-2xl border border-[rgba(26,26,26,0.1)] bg-white px-4 py-3.5 focus-within:border-[#1a1a1a]">
                <textarea
                  value={headline}
                  maxLength={HEADLINE_MAX}
                  rows={3}
                  onChange={(event) => setHeadline(event.target.value)}
                  placeholder="Will energy PMs become a top-3 vertical by volume within 5 years?"
                  className="w-full resize-none bg-transparent font-serif text-[20px] leading-8 text-[#1a1a1a] outline-none placeholder:text-[#c8c4bc]"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[12px] text-[#9a9a9a]">Public headline unless you encrypt it.</p>
                  <p className="font-mono text-[10px] text-[#b0b0b0]">
                    {headline.length} / {HEADLINE_MAX}
                  </p>
                </div>
              </div>
              <Switch
                on={encryptHeadline}
                onChange={setEncryptHeadline}
                label="Encrypt headline"
                hint="People see that you committed to something, and when — not the wording."
              />
            </Field>

            <Field
              n="02"
              title="Resolution rules"
              hint="Cite a source, an exact time, and the tie-breaker. This is the contract."
            >
              <div className="rounded-2xl border border-[rgba(26,26,26,0.1)] bg-white px-4 py-3.5 focus-within:border-[#1a1a1a]">
                <textarea
                  value={terms}
                  maxLength={TERMS_MAX}
                  rows={8}
                  onChange={(event) => setTerms(event.target.value)}
                  placeholder="Resolves YES if… Source: … Timestamp in UTC: … If the source is unavailable or the print is a tie, then…"
                  className="w-full resize-y bg-transparent text-[15px] leading-7 text-[#1a1a1a] outline-none placeholder:text-[#c8c4bc]"
                />
                <p className="mt-2 text-right font-mono text-[10px] text-[#b0b0b0]">
                  {terms.length.toLocaleString("en-US")} / {TERMS_MAX.toLocaleString("en-US")}
                </p>
              </div>
              <Switch
                on={encryptTerms}
                onChange={setEncryptTerms}
                label="Encrypt terms"
                hint="Hide the criteria until resolution. Same password, separate salt on-chain."
              />

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="block rounded-2xl border border-[rgba(26,26,26,0.1)] bg-white px-4 py-3 focus-within:border-[#1a1a1a]">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Resolves by
                  </span>
                  <input
                    type="datetime-local"
                    value={resolves}
                    onChange={(event) => setResolves(event.target.value)}
                    className="mt-2 w-full bg-transparent font-serif text-[16px] text-[#1a1a1a] outline-none"
                  />
                </label>
                <label className="block rounded-2xl border border-[rgba(26,26,26,0.1)] bg-white px-4 py-3 focus-within:border-[#1a1a1a]">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                    Timezone
                  </span>
                  <select
                    value={timeZone}
                    onChange={(event) => setTimeZone(event.target.value)}
                    className="mt-2 w-full appearance-none bg-transparent font-serif text-[16px] text-[#1a1a1a] outline-none"
                  >
                    {TIMEZONES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="mt-2 text-[12px] text-[#8a8a8a]">
                {formatUtcLine(resolves, timeZone, zoneLabel)}
              </p>
            </Field>

            <Field
              n="03"
              title="Listing"
              hint="How this contract shows on the floor."
              last
            >
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                Categories
              </p>
              <div className="flex flex-wrap gap-2">
                {TOPIC_CATEGORIES.map((item) => {
                  const active = topics.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleTopic(item.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition ${
                        active
                          ? "border-[#1a1a1a] bg-[#1a1a1a] text-white"
                          : "border-[rgba(26,26,26,0.12)] bg-white text-[#4a4a4a] hover:border-[rgba(26,26,26,0.28)]"
                      }`}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: active ? "#fff" : item.color }}
                      />
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="flex items-center gap-2 rounded-2xl border border-[rgba(26,26,26,0.1)] bg-white px-4 py-3 focus-within:border-[#1a1a1a]">
                  <span className="font-serif text-[20px] text-[#8a8a8a]">#</span>
                  <input
                    value={tag}
                    maxLength={TAG_MAX}
                    onChange={(event) =>
                      setTag(event.target.value.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase())
                    }
                    placeholder="election-2028"
                    className="w-full bg-transparent font-mono text-[14px] tracking-[0.04em] text-[#1a1a1a] outline-none placeholder:text-[#c8c4bc]"
                  />
                  <span className="shrink-0 font-mono text-[10px] text-[#b0b0b0]">
                    {tag.length}/{TAG_MAX}
                  </span>
                </label>
                <div className="flex rounded-full border border-[rgba(26,26,26,0.1)] bg-white p-1">
                  {(
                    [
                      ["public", "Public"],
                      ["private", "Private"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setVisibility(id)}
                      className={`rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] ${
                        visibility === id ? "bg-[#1a1a1a] text-white" : "text-[#8a8a8a]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-2 text-[12px] text-[#8a8a8a]">
                {visibility === "public"
                  ? "Anyone can find this contract on the dashboard."
                  : "Only people with the link can open this contract."}
              </p>
            </Field>
          </form>

          {preview ? (
            <aside className="xl:sticky xl:top-6">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">
                Live preview
              </p>
              <motion.article
                layout={!reduce}
                className="rounded-[22px] border border-[rgba(26,26,26,0.08)] bg-[#fbfaf7] p-5 shadow-[0_18px_50px_-36px_rgba(26,26,26,0.4)]"
                style={{ borderLeft: `4px solid ${accent}` }}
              >
                <div className="flex items-start gap-3">
                  <Identicon seed={headline.trim() || "open"} className="h-10 w-10 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#c4a46a]">
                      Contract · Draft
                    </p>
                    <h2 className="mt-1 font-serif text-[22px] leading-snug tracking-[-0.03em] text-[#1a1a1a]">
                      {headline.trim() || "Your question appears here"}
                    </h2>
                  </div>
                </div>
                <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a8a8a]">
                  {topics.length ? (
                    topics.map((id) => (
                      <span key={id} className="inline-flex items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: categoryColor(id) }}
                        />
                        {categoryLabel(id)}
                      </span>
                    ))
                  ) : (
                    <span>No category yet</span>
                  )}
                  <span>#{tag || "untagged"}</span>
                  <span>{visibility === "public" ? "Public" : "Private"}</span>
                </p>
                <p className="mt-3 line-clamp-4 text-[13px] leading-5 text-[#6e6e6e]">
                  {terms.trim() ||
                    "Resolution rules will show here so bettors know exactly how this settles."}
                </p>
                <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                  Resolves {formatPreviewStamp(resolves)}
                </p>
              </motion.article>

              <ul className="mt-4 space-y-2 rounded-[18px] border border-[rgba(26,26,26,0.08)] bg-white px-4 py-4">
                {checks.map((item) => (
                  <li key={item.id} className="flex items-center gap-2.5 text-[13px]">
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                        item.done ? "bg-[#1a1a1a] text-white" : "border border-[#d0ccc4] text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className={item.done ? "text-[#1a1a1a]" : "text-[#8a8a8a]"}>
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>

              {published ? (
                <p className="mt-4 rounded-2xl bg-[#e7f4ec] px-4 py-3 text-[13px] text-[#2f9e6e]">
                  Draft kept in this tab only. Contract publishing is not live yet, so nothing was submitted.
                </p>
              ) : null}

              <button
                type="submit"
                form="write-contract"
                disabled={!canPublish}
                className={`mt-4 w-full rounded-full py-3.5 text-[12px] font-semibold tracking-[0.16em] uppercase transition ${
                  canPublish
                    ? "bg-[#111111] text-white hover:bg-black"
                    : "cursor-not-allowed bg-[#dedad3] text-[#9a9a9a]"
                }`}
              >
                {published ? "Draft only" : "Publish contract"}
              </button>
              <p className="mt-3 text-center text-[12px] leading-5 text-[#8a8a8a]">{encryptNote}</p>

              <div className="mt-8">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">
                  Writing tips
                </p>
                <ul className="mt-3 space-y-2.5 text-[13px] leading-5 text-[#6e6e6e]">
                  <li>Name one verifiable outcome. Do not bundle two questions.</li>
                  <li>Cite a specific source and an exact UTC time.</li>
                  <li>Spell out the tie-breaker if the source is missing or ambiguous.</li>
                </ul>
              </div>
            </aside>
          ) : null}
        </div>
      </Shell>
    </div>
  );
}

function Field({
  n,
  title,
  hint,
  last = false,
  children,
}: {
  n: string;
  title: string;
  hint: string;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`px-5 py-7 sm:px-8 ${last ? "" : "border-b border-[rgba(26,26,26,0.08)]"}`}
    >
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#c4a46a]">{n}</p>
          <h2 className="mt-1 font-serif text-[24px] tracking-[-0.03em] text-[#1a1a1a]">{title}</h2>
        </div>
      </div>
      <p className="mb-4 max-w-[40rem] text-[13px] leading-5 text-[#8a8a8a]">{hint}</p>
      {children}
    </section>
  );
}

function Switch({
  on,
  onChange,
  label,
  hint,
}: {
  on: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="mt-4 flex w-full items-start gap-3 rounded-2xl border border-[rgba(26,26,26,0.08)] bg-white/70 px-3.5 py-3 text-left"
    >
      <span
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${
          on ? "bg-[#1a1a1a]" : "bg-[#d5d1c9]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
            on ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
      <span>
        <span className="block text-[13px] font-medium text-[#1a1a1a]">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-5 text-[#8a8a8a]">{hint}</span>
      </span>
    </button>
  );
}

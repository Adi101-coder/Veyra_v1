"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { categories, type CategoryId } from "@/lib/markets";
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

function formatWallClock(value: string) {
  const parts = parseWall(value);
  if (!parts) return "Set a time";
  const mer = parts.hour >= 12 ? "PM" : "AM";
  const hour = parts.hour % 12 || 12;
  return `${String(hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")} ${mer} ${MONTHS[parts.month - 1]} ${String(parts.day).padStart(2, "0")}, ${parts.year}`;
}

function formatPreviewStamp(value: string) {
  const parts = parseWall(value);
  if (!parts) return "—";
  const mer = parts.hour >= 12 ? "PM" : "AM";
  const hour = parts.hour % 12 || 12;
  return `${hour}:${String(parts.minute).padStart(2, "0")} ${mer} ${MONTHS[parts.month - 1].toUpperCase()} ${parts.day}, ${parts.year}`;
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
    second: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  });
  return `Interpreted in ${zoneLabel} — ${stamp.replace(",", "")} UTC`;
}

export function WriteView() {
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
  const blockers = useMemo(() => {
    const list: string[] = [];
    if (!headline.trim()) list.push("Add a headline.");
    return list;
  }, [headline]);
  const canPublish = blockers.length === 0 && !published;

  const encryptNote = encryptHeadline && encryptTerms
    ? "Headline and terms are encrypted on-chain."
    : encryptHeadline
      ? "Headline is encrypted. Terms go on-chain in clear."
      : encryptTerms
        ? "Terms are encrypted. The question goes on-chain in clear."
        : "Nothing is encrypted. The question and terms go on-chain in clear";

  const toggleTopic = (id: TopicId) => {
    setTopics((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  return (
    <div className="bg-[#eceae4]">
      <Shell className="pt-4 pb-20 sm:pt-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <p className="flex flex-wrap items-center gap-2 font-serif text-[13px] text-[#8a8a8a]">
            <Link href="/dashboard" className="text-[#5a5a5a] no-underline hover:text-[#1a1a1a]">
              ← Dashboard
            </Link>
            <span>/</span>
            <span className="text-[#1a1a1a]">Write a Contract</span>
          </p>
          <button
            type="button"
            onClick={() => setPreview((value) => !value)}
            className="rounded-full border border-[rgba(26,26,26,0.14)] bg-white px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#5a5a5a]"
          >
            {preview ? "× Close preview" : "Show preview"}
          </button>
        </div>

        <div
          className={`grid items-start gap-10 lg:gap-14 ${
            preview ? "lg:grid-cols-[minmax(0,1fr)_20.5rem] xl:grid-cols-[minmax(0,1fr)_22rem]" : ""
          }`}
        >
          <form
            id="write-contract"
            className="min-w-0"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canPublish) return;
              setPublished(true);
            }}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c45c5c]">
              New contract <span className="text-[#b0b0b0]">·</span> Draft
            </p>
            <h1 className="mt-3 font-serif text-[36px] leading-none tracking-[-0.03em] text-[#1a1a1a] sm:text-[42px]">
              Write a Contract.
            </h1>
            <p className="mt-4 max-w-[34rem] text-[15px] leading-6 text-[#6e6e6e] italic">
              Set your Terms and Resolution criteria. Others will be able to make Wagers using your
              Contract.
            </p>

            <div className="mt-8 border-t border-[rgba(26,26,26,0.12)]">
              <Clause roman="I" title="Headline" prompt="What is the question?">
                <input
                  value={headline}
                  maxLength={HEADLINE_MAX}
                  onChange={(event) => setHeadline(event.target.value)}
                  placeholder="e.g., 'Energy PM's become a top 3 vertical by volume within 5 years'"
                  className="w-full bg-transparent font-serif text-[18px] leading-7 text-[#1a1a1a] outline-none placeholder:italic placeholder:text-[#c8c4bc]"
                />
                <div className="mt-3 flex items-end justify-between gap-4">
                  <p className="text-[12px] italic text-[#8a8a8a]">
                    One sentence. State exactly what is being wagered on.
                  </p>
                  <p className="shrink-0 font-mono text-[10px] text-[#b0b0b0]">
                    {headline.length} / {HEADLINE_MAX}
                  </p>
                </div>
                <Switch
                  on={encryptHeadline}
                  onChange={setEncryptHeadline}
                  label="Encrypt Headline"
                  hint="Stored as ciphertext on-chain. People see that you committed to something, and when — not what."
                />
              </Clause>

              <Clause roman="II" title="Terms" prompt="How does this resolve?">
                <textarea
                  value={terms}
                  maxLength={TERMS_MAX}
                  rows={3}
                  onChange={(event) => setTerms(event.target.value)}
                  placeholder="Describe how this Contract resolves, and under what conditions."
                  className="w-full resize-none bg-transparent font-serif text-[18px] leading-7 text-[#1a1a1a] outline-none placeholder:italic placeholder:text-[#c8c4bc]"
                />
                <div className="mt-3 flex items-end justify-between gap-4">
                  <p className="text-[12px] italic text-[#8a8a8a]">
                    Specify sources and exact times (e.g. UTC); account for tie-breakers and edge
                    cases.
                  </p>
                  <p className="shrink-0 font-mono text-[10px] text-[#b0b0b0]">
                    {terms.length} / {TERMS_MAX.toLocaleString("en-US")}
                  </p>
                </div>
                <Switch
                  on={encryptTerms}
                  onChange={setEncryptTerms}
                  label="Encrypt Terms"
                  hint="Turn this on to hide the resolution criteria too — same password, separate salt on-chain."
                />
              </Clause>

              <Clause roman="III" title="Categories" prompt="Pick one or more:">
                <div className="flex flex-wrap gap-x-5 gap-y-3">
                  {TOPIC_CATEGORIES.map((item) => {
                    const active = topics.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleTopic(item.id)}
                        className="inline-flex items-center gap-2 text-[14px] text-[#1a1a1a]"
                      >
                        <span
                          className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
                            active ? "border-[#1a1a1a]" : "border-[#b8b4ac]"
                          }`}
                        >
                          {active ? <span className="h-1.5 w-1.5 rounded-full bg-[#1a1a1a]" /> : null}
                        </span>
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </Clause>

              <Clause roman="IV" title="Hashtag" prompt="How is it tagged?">
                <label className="flex items-baseline gap-2 border-b border-dashed border-[rgba(26,26,26,0.28)] pb-1">
                  <span className="font-serif text-[22px] text-[#1a1a1a]">#</span>
                  <input
                    value={tag}
                    maxLength={TAG_MAX}
                    onChange={(event) =>
                      setTag(event.target.value.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase())
                    }
                    placeholder="----------------"
                    className="w-full bg-transparent font-mono text-[15px] tracking-[0.18em] text-[#1a1a1a] outline-none placeholder:text-[#d0ccc4]"
                  />
                </label>
                <div className="mt-3 flex items-end justify-between gap-4">
                  <p className="text-[12px] italic text-[#8a8a8a]">
                    A short tag to group related contracts — e.g. ufc-400, btc, election-2028.
                  </p>
                  <p className="shrink-0 font-mono text-[10px] text-[#b0b0b0]">
                    {tag.length} / {TAG_MAX}
                  </p>
                </div>
              </Clause>

              <Clause roman="V" title="Resolution" prompt="When is it judged?">
                <div className="grid gap-6 sm:grid-cols-2">
                  <label className="relative block cursor-pointer">
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9a9a9a]">
                      Resolves by
                    </span>
                    <span className="mt-2 flex items-center gap-2 font-serif text-[18px] tracking-[-0.02em] text-[#1a1a1a]">
                      {formatWallClock(resolves)}
                      <svg viewBox="0 0 16 16" className="h-4 w-4 text-[#8a8a8a]" aria-hidden>
                        <rect x="2" y="3.5" width="12" height="10.5" rx="1.2" fill="none" stroke="currentColor" />
                        <path d="M2 6.5h12M5 2v3M11 2v3" stroke="currentColor" fill="none" />
                      </svg>
                    </span>
                    <input
                      type="datetime-local"
                      value={resolves}
                      onChange={(event) => setResolves(event.target.value)}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                  <label className="block">
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9a9a9a]">
                      Timezone
                    </span>
                    <select
                      value={timeZone}
                      onChange={(event) => setTimeZone(event.target.value)}
                      className="mt-2 w-full appearance-none border-0 bg-transparent font-serif text-[18px] tracking-[-0.02em] text-[#1a1a1a] outline-none"
                    >
                      {TIMEZONES.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="mt-3 text-[12px] italic text-[#8a8a8a]">
                  {formatUtcLine(resolves, timeZone, zoneLabel.split(" / ")[0] ?? zoneLabel)}
                </p>
              </Clause>

              <Clause roman="VI" title="Visibility" prompt="Who can see it?" last>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-6">
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
                        className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#1a1a1a]"
                      >
                        <span
                          className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
                            visibility === id ? "border-[#1a1a1a]" : "border-[#b8b4ac]"
                          }`}
                        >
                          {visibility === id ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-[#1a1a1a]" />
                          ) : null}
                        </span>
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[12px] italic text-[#8a8a8a]">
                    {visibility === "public"
                      ? "Anyone can see this contract on the dashboard."
                      : "Only people with the link can find this contract."}
                  </p>
                </div>
              </Clause>
            </div>
          </form>

          {preview ? (
            <aside className="lg:sticky lg:top-6">
              <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-[#1a1a1a]">
                Preview & confirmation
              </p>
              <div className="rounded-[18px] border border-dashed border-[rgba(196,164,106,0.55)] bg-[#f3ead8]/40 px-5 py-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#c4a46a]">
                  Contract <span className="text-[#b0b0b0]">·</span> Draft
                </p>
                <h2 className="mt-3 font-serif text-[22px] leading-snug tracking-[-0.03em] text-[#1a1a1a]">
                  {headline.trim() || "Your headline will appear here"}
                </h2>
                <p className="mt-3 text-[13px] italic text-[#8a8a8a]">
                  {visibility === "public" ? "Public · readable by anyone" : "Private · link only"}
                </p>
                <p className="mt-3 text-[13px] italic text-[#8a8a8a]">
                  {encryptTerms
                    ? "Terms stay hidden until resolution."
                    : "Terms will be shown to bettors before they place a wager."}
                </p>
                <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">
                  Resolves {formatPreviewStamp(resolves)}
                </p>
              </div>

              {published ? (
                <p className="mt-4 rounded-lg bg-[#e7f4ec] px-4 py-3 text-[13px] text-[#2f9e6e]">
                  Contract queued. It will show under New on the dashboard.
                </p>
              ) : blockers.length ? (
                <div className="mt-4 rounded-lg bg-[#f8e8ea] px-4 py-3">
                  <p className="text-[13px] font-medium text-[#c45c5c]">Before you can publish:</p>
                  {blockers.map((item) => (
                    <p key={item} className="mt-1 text-[13px] text-[#c45c5c]">
                      {item}
                    </p>
                  ))}
                </div>
              ) : null}

              <button
                type="submit"
                form="write-contract"
                disabled={!canPublish}
                className={`mt-4 w-full rounded-md py-3.5 text-[12px] font-semibold tracking-[0.18em] uppercase ${
                  canPublish
                    ? "bg-[#111111] text-white hover:bg-black"
                    : "cursor-not-allowed bg-[#c8c4bc] text-white"
                }`}
              >
                {published ? "Published" : "Publish Contract"}
              </button>
              <p className="mt-3 text-center text-[12px] leading-5 text-[#8a8a8a]">{encryptNote}</p>

              <div className="mt-10">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#1a1a1a]">
                  Writing tips
                </p>
                <ul className="mt-4 space-y-3 text-[13px] leading-5 text-[#6e6e6e]">
                  <li>
                    — Name a single, verifiable outcome — avoid bundling multiple questions.
                  </li>
                  <li>
                    — Cite a specific source (CoinGecko, ESPN, official press release) and an exact
                    time in UTC.
                  </li>
                  <li>
                    — Spell out the tie-breaker. What happens if the source is unavailable or
                    ambiguous?
                  </li>
                  <li>
                    — Pick a resolution date that gives bettors time and you a clear judgment
                    moment.
                  </li>
                </ul>
              </div>
            </aside>
          ) : null}
        </div>
      </Shell>
    </div>
  );
}

function Clause({
  roman,
  title,
  prompt,
  last = false,
  children,
}: {
  roman: string;
  title: string;
  prompt: string;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid gap-4 py-8 sm:grid-cols-[8.75rem_minmax(0,1fr)] sm:gap-10 ${
        last ? "" : "border-b border-[rgba(26,26,26,0.12)]"
      }`}
    >
      <div>
        <p className="font-serif text-[40px] leading-none tracking-[-0.04em] text-[#1a1a1a]">
          {roman}
        </p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#6e6e6e]">
          {title}
        </p>
        <p className="mt-2 max-w-[8rem] text-[13px] leading-4 italic text-[#8a8a8a]">{prompt}</p>
      </div>
      <div className="min-w-0 pt-1">{children}</div>
    </div>
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
    <button type="button" onClick={() => onChange(!on)} className="mt-5 flex items-start gap-3 text-left">
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
        <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-[#1a1a1a]">
          {label}
        </span>
        <span className="mt-1 block text-[12px] leading-5 italic text-[#8a8a8a]">{hint}</span>
      </span>
    </button>
  );
}

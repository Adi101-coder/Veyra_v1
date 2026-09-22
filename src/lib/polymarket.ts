import {
  categoryColor,
  formatUsdCompact,
  hashSeed,
  type CategoryId,
  type Market,
  type MarketOutcome,
} from "@/lib/markets";
import { peekPolymarketCache, polymarketJson } from "@/lib/polymarket-http";

const GAMMA = process.env.POLYMARKET_GAMMA_URL ?? "https://gamma-api.polymarket.com";
const DATA = process.env.POLYMARKET_DATA_URL ?? "https://data-api.polymarket.com";

type GammaTag = { label?: string; slug?: string };

type GammaMarket = {
  id?: string;
  slug?: string;
  question?: string;
  groupItemTitle?: string;
  conditionId?: string;
  clobTokenIds?: string | string[];
  outcomes?: string | string[];
  outcomePrices?: string | string[];
  volume?: string | number;
  volumeNum?: number;
  volume24hr?: number;
  liquidity?: string | number;
  liquidityNum?: number;
  endDate?: string;
  startDate?: string;
  image?: string;
  icon?: string;
  active?: boolean;
  closed?: boolean;
  new?: boolean;
  featured?: boolean;
  acceptingOrders?: boolean;
  commentCount?: number;
  events?: GammaEvent[];
};

type GammaEvent = {
  id?: string;
  slug?: string;
  title?: string;
  ticker?: string;
  image?: string;
  icon?: string;
  volume?: number | string;
  volume24hr?: number;
  liquidity?: number | string;
  endDate?: string;
  startDate?: string;
  featured?: boolean;
  new?: boolean;
  closed?: boolean;
  tags?: GammaTag[];
  markets?: GammaMarket[];
};

/** Next uses this digest to switch a route to dynamic rendering. Catching it turns the page into a 500. */
export function rethrowIfDynamicServer(error: unknown): void {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    (error as { digest?: unknown }).digest === "DYNAMIC_SERVER_USAGE"
  ) {
    throw error;
  }
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function num(value: unknown) {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function mapCategory(tags: string[], title = ""): Exclude<CategoryId, "all"> {
  const blob = `${tags.join(" ")} ${title}`.toLowerCase();
  if (/\b(lol|lcs|dota|cs2|valorant|esport|league of legends)\b/.test(blob)) return "sports";
  if (/\b(sport|soccer|nba|nfl|mlb|nhl|ufc|tennis|football|laliga|premier|mma|ncaa|cfb|ncaaf|vs\.?|versus)\b/.test(blob)) {
    return "sports";
  }
  if (/\b(crypto|bitcoin|ethereum|btc|eth|solana|defi)\b/.test(blob)) return "crypto";
  if (/\b(politic|election|president|geopolit|congress|trump|fed|parliament)\b/.test(blob)) {
    return "politics";
  }
  if (/\b(entertain|movie|oscar|music|celebrity|pop culture)\b/.test(blob)) {
    return "entertainment";
  }
  if (/\b(science|tech|ai|space|openai)\b/.test(blob)) return "science";
  if (/\b(weather|climate|nature)\b/.test(blob)) return "weather";
  if (/\b(culture|society)\b/.test(blob)) return "culture";
  if (/\b(finance|econ|gdp|inflation|rate)\b/.test(blob)) return "finance";
  return "politics";
}

function resolvesIn(endDate?: string) {
  if (!endDate) return "—";
  const ms = new Date(endDate).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "soon";
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function resolvesAt(endDate?: string) {
  if (!endDate) return "";
  const date = new Date(endDate);
  if (!Number.isFinite(date.getTime())) return endDate;
  return date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function pct(price: number) {
  return Math.max(1, Math.min(99, Math.round((price || 0) * 100)));
}

function yesPrice(market: GammaMarket) {
  const labels = parseList(market.outcomes).map((item) => item.toLowerCase());
  const prices = parseList(market.outcomePrices).map(num);
  const yesIndex = labels.findIndex((label) => label === "yes");
  const price = yesIndex >= 0 ? prices[yesIndex] : prices[0];
  return pct(price || 0.5);
}

function isYesNoLabel(label: string) {
  return /^(yes|no)$/i.test(label.trim());
}

function isBinary(market: GammaMarket) {
  const labels = parseList(market.outcomes).map((label) => label.toLowerCase());
  return labels.includes("yes") && labels.includes("no");
}

function isTwoSided(market: GammaMarket) {
  return parseList(market.outcomes).length >= 2;
}

function tidyName(value: string) {
  return value
    .replace(/^(lol|cs2|dota 2|dota2|valorant|nba|nfl|mlb|nhl|ufc):\s*/i, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMatchupTitle(title?: string): [string, string] | null {
  if (!title) return null;
  const cleaned = tidyName(title).replace(/\s+[—–-]\s+.*$/, "").trim();
  const match = cleaned.match(/^(.+?)\s+(?:vs\.?|versus)\s+(.+)$/i);
  if (!match) return null;
  const a = tidyName(match[1]);
  const b = tidyName(match[2]);
  if (!a || !b || a.length > 42 || b.length > 42) return null;
  return [a, b];
}

function namedFromQuestion(question?: string) {
  if (!question) return "";
  const match = question.match(
    /^will\s+(.+?)\s+(win|beat|defeat|become|be the|gain|take|qualify|advance|cover)\b/i,
  );
  const name = match?.[1]?.trim() ?? "";
  return name && !isYesNoLabel(name) && name.length <= 42 ? name : "";
}

function fieldFromEvent(event: GammaEvent): MarketOutcome[] {
  const open = (event.markets ?? []).filter((item) => item.closed !== true && item.active !== false);
  const rows = open
    .map((item) => {
      const label = (item.groupItemTitle?.trim() || namedFromQuestion(item.question) || "").trim();
      if (!label || isYesNoLabel(label)) return null;
      return { label: tidyName(label), chance: yesPrice(item) };
    })
    .filter((row): row is MarketOutcome => Boolean(row));
  const unique = new Map<string, MarketOutcome>();
  for (const row of rows) {
    const key = row.label.toLowerCase();
    const existing = unique.get(key);
    if (!existing || row.chance > existing.chance) unique.set(key, row);
  }
  return [...unique.values()].sort((a, b) => b.chance - a.chance);
}

export function resolveLiveOutcomes(event: GammaEvent, raw: GammaMarket): {
  title: string;
  outcomes: MarketOutcome[];
} {
  const labels = parseList(raw.outcomes);
  const prices = parseList(raw.outcomePrices).map(num);
  const named = labels.filter((label) => !isYesNoLabel(label));
  const eventTitle = event.title?.trim() || "";
  const question = raw.question?.trim() || "";
  const field = fieldFromEvent(event);

  if (named.length >= 2) {
    return {
      title: eventTitle || question,
      outcomes: labels.map((label, index) => ({
        label: tidyName(label),
        chance: pct(prices[index] || (index === 0 ? 0.5 : 0)),
      })),
    };
  }

  if (field.length >= 3) {
    return { title: eventTitle || question, outcomes: field };
  }

  const matchup =
    parseMatchupTitle(eventTitle) || parseMatchupTitle(question) || parseMatchupTitle(raw.slug?.replace(/-/g, " "));
  if (matchup) {
    const yes = yesPrice(raw);
    return {
      title: eventTitle || `${matchup[0]} vs ${matchup[1]}`,
      outcomes: [
        { label: matchup[0], chance: yes },
        { label: matchup[1], chance: Math.max(1, 100 - yes) },
      ],
    };
  }

  if (field.length === 2) {
    return { title: eventTitle || question, outcomes: field };
  }

  const candidate = raw.groupItemTitle?.trim() || namedFromQuestion(question);
  if (candidate && !isYesNoLabel(candidate) && (field.length > 0 || openSiblings(event) > 1)) {
    const yes = yesPrice(raw);
    return {
      title: eventTitle || question,
      outcomes: [
        { label: tidyName(candidate), chance: yes },
        { label: "Field", chance: Math.max(1, 100 - yes) },
      ],
    };
  }

  return {
    title: question || eventTitle,
    outcomes: [
      { label: "Yes", chance: yesPrice(raw) },
      { label: "No", chance: Math.max(1, 100 - yesPrice(raw)) },
    ],
  };
}

function openSiblings(event: GammaEvent) {
  return (event.markets ?? []).filter((item) => item.closed !== true && item.active !== false).length;
}

function liveCandidates(event: GammaEvent) {
  const open = (event.markets ?? []).filter((item) => item.closed !== true && item.active !== false);
  const twoSided = open.filter(isTwoSided);
  const binary = twoSided.filter(isBinary);
  const pool = twoSided.length ? twoSided : open;
  const preferred = fieldFromEvent(event).length >= 3 ? pool : binary.length ? binary : pool;
  return [...preferred].sort(
    (a, b) => num(b.volume24hr ?? b.volumeNum) - num(a.volume24hr ?? a.volumeNum),
  );
}

function isTotalsMarket(market: GammaMarket) {
  return parseList(market.outcomes).some((label) => /^(over|under)$/i.test(label));
}

function pickLeadMarket(event: GammaEvent) {
  const candidates = liveCandidates(event);
  return candidates.find((item) => !isTotalsMarket(item)) ?? candidates[0] ?? null;
}

function pickMarket(event: GammaEvent) {
  return liveCandidates(event)[0] ?? null;
}

function toMarket(event: GammaEvent, raw: GammaMarket, asEvent = false): Market | null {
  const display = resolveLiveOutcomes(event, raw);
  const slug = asEvent ? event.slug || raw.slug : raw.slug || event.slug;
  if (!slug) return null;
  const tags = (event.tags ?? []).map((tag) => tag.label || tag.slug || "").filter(Boolean);
  const title = display.title || raw.question || event.title || slug;
  const category = mapCategory(tags, title);
  const lead = display.outcomes[0] ?? { label: "Yes", chance: yesPrice(raw) };
  const trail = display.outcomes[1] ?? { label: "No", chance: Math.max(1, 100 - lead.chance) };
  const volume = num(raw.volumeNum ?? raw.volume ?? event.volume);
  const volume24 = num(raw.volume24hr ?? event.volume24hr);
  const liquidity = num(raw.liquidityNum ?? raw.liquidity ?? event.liquidity);
  const accepting = raw.acceptingOrders !== false && raw.closed !== true;
  const end = raw.endDate || event.endDate;
  const hoursLeft = end ? (new Date(end).getTime() - Date.now()) / 3_600_000 : 999;
  const created = raw.startDate ? Date.now() - new Date(raw.startDate).getTime() : 0;
  const status: Market["status"] =
    raw.closed === true
      ? "resolved"
      : hoursLeft > 0 && hoursLeft <= 72
        ? "soon"
        : raw.new === true || created < 1000 * 60 * 60 * 24 * 4
          ? "new"
          : volume24 > 250_000 || event.featured === true
            ? "trending"
            : accepting
              ? "open"
              : "trending";

  const seed = hashSeed(slug);
  return {
    id: slug,
    title,
    category,
    tag: event.ticker || tags[0]?.toLowerCase().replace(/\s+/g, "-") || "live",
    staked: formatUsdCompact(volume),
    tables: 0,
    openSeats: accepting ? 1 : 0,
    resolvesIn: resolvesIn(end),
    resolvesAt: resolvesAt(end),
    // Veyra wager count is not known from Gamma; never invent one.
    wagers: 0,
    status,
    accent: categoryColor(category),
    featured: event.featured === true || volume24 > 1_000_000 || seed % 7 === 0,
    image: raw.icon || raw.image || event.icon || event.image,
    volumeUsd: volume,
    volume24hrUsd: volume24,
    liquidityUsd: liquidity,
    live: true,
    source: "polymarket",
    conditionId: raw.conditionId,
    // Event cards still use the event slug as `id`, but the lead child's CLOB
    // tokens must stay attached or the contract page cannot quote YES/NO.
    clobTokenIds: parseList(raw.clobTokenIds),
    // No fabricated stake tables for live markets.
    tableOptions: [],
    outcomes: display.outcomes,
    seats: [
      {
        id: "A",
        wallet: lead.label,
        avatar: `${slug}-${lead.label}`,
        chance: lead.chance,
        side: "lands",
      },
      {
        id: "B",
        wallet: trail.label,
        avatar: `${slug}-${trail.label}`,
        chance: trail.chance,
        side: "misses",
      },
    ],
  };
}

async function gamma<T>(path: string, ttlMs = 30_000): Promise<T> {
  return (await polymarketJson(`${GAMMA}${path}`, ttlMs)) as T;
}

function coalesceEvents(rows: GammaMarket[]): GammaEvent[] {
  const byEvent = new Map<string, GammaEvent>();
  rows.forEach((raw, index) => {
    const nested = raw.events?.[0];
    const key = String(nested?.slug || nested?.id || raw.slug || index);
    const base = byEvent.get(key) ?? {
      ...nested,
      slug: nested?.slug || raw.slug,
      title: nested?.title || raw.question,
      markets: [],
    };
    const markets = [...(base.markets ?? [])];
    const push = (item: GammaMarket) => {
      if (markets.some((existing) => (existing.slug && existing.slug === item.slug) || (existing.id && existing.id === item.id))) {
        return;
      }
      markets.push(item);
    };
    push(raw);
    for (const item of nested?.markets ?? []) push(item);
    byEvent.set(key, { ...base, markets });
  });
  return [...byEvent.values()];
}

function mapEvents(events: GammaEvent[], limit: number) {
  const mapped: Market[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const field = fieldFromEvent(event);
    const lead = pickLeadMarket(event);
    if (!lead) continue;
    const matchup =
      parseMatchupTitle(event.title) || parseMatchupTitle(lead.question) || parseMatchupTitle(lead.slug?.replace(/-/g, " "));
    if (field.length >= 2 || matchup) {
      const market = toMarket(event, lead, Boolean(event.slug));
      if (market && !seen.has(market.id)) {
        seen.add(market.id);
        mapped.push(market);
        if (mapped.length >= limit) return mapped;
      }
      continue;
    }
    for (const raw of liveCandidates(event).filter((item) => !isTotalsMarket(item) || liveCandidates(event).length === 1)) {
      const market = toMarket(event, raw);
      if (!market || seen.has(market.id)) continue;
      seen.add(market.id);
      mapped.push(market);
      if (mapped.length >= limit) return mapped;
    }
  }
  return mapped;
}

export async function fetchPolymarketMarkets(limit = 36): Promise<Market[]> {
  const page = Math.min(80, Math.max(limit, 12));
  const path = `/markets?active=true&closed=false&limit=${page}&order=volume24hr&ascending=false`;
  try {
    const rows = await gamma<GammaMarket[]>(path);
    const mapped = mapEvents(coalesceEvents(rows), limit);
    if (mapped.length) return mapped;
    return mapEvents(
      rows.map((raw) => ({ slug: raw.slug, title: raw.question, markets: [raw] })),
      limit,
    );
  } catch (error) {
    rethrowIfDynamicServer(error);
    const stale = peekPolymarketCache<GammaMarket[]>(`${GAMMA}${path}`);
    if (stale?.length) {
      return mapEvents(coalesceEvents(stale), limit);
    }
    throw error;
  }
}

export async function fetchPolymarketMarket(id: string): Promise<Market | null> {
  const slug = encodeURIComponent(id);
  try {
    const markets = await gamma<GammaMarket[]>(`/markets?slug=${slug}&limit=1`);
    const raw = markets[0];
    if (raw) {
      const event = raw.events?.[0] ?? { slug: raw.slug, title: raw.question, markets: [raw] };
      return toMarket(event, raw);
    }
  } catch (error) {
    rethrowIfDynamicServer(error);
    // try the direct slug endpoint next
  }
  try {
    // `/markets?slug=` defaults to closed=false; this endpoint also returns resolved markets.
    const raw = await gamma<GammaMarket>(`/markets/slug/${slug}`);
    if (raw && raw.slug) {
      const event = raw.events?.[0] ?? { slug: raw.slug, title: raw.question, markets: [raw] };
      return toMarket(event, raw);
    }
  } catch (error) {
    rethrowIfDynamicServer(error);
    // try events next
  }
  try {
    const events = await gamma<GammaEvent[]>(`/events?slug=${slug}&limit=1`);
    const event = events[0];
    if (!event) return null;
    const raw = pickMarket(event);
    return raw ? toMarket(event, raw, fieldFromEvent(event).length >= 3) : null;
  } catch (error) {
    rethrowIfDynamicServer(error);
    return null;
  }
}

export type LiveTrade = {
  id: string;
  marketId: string;
  trader: string;
  avatar: string | null;
  ago: string;
  invested: string;
  payout: string;
  title: string;
  icon: string | null;
  side: string;
  chance: number;
  up: boolean;
};

export type VenueTraderPosition = {
  id: string;
  marketId: string;
  title: string;
  outcome: string;
  shares: string;
  avgPrice: string;
  currentPrice: string;
  value: string;
  pnl: string;
  pnlPct: string;
  up: boolean;
  icon: string | null;
};

export type VenueHolder = {
  id: string;
  marketId: string;
  trader: string;
  avatar: string | null;
  outcome: string;
  shares: string;
  value: string;
  pnl: string | null;
  up: boolean;
};

type JsonRow = Record<string, unknown>;

function isRow(value: unknown): value is JsonRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rowsOf(payload: unknown): JsonRow[] {
  if (Array.isArray(payload)) return payload.filter(isRow);
  if (isRow(payload) && Array.isArray(payload.data)) return payload.data.filter(isRow);
  return [];
}

function pick(row: JsonRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value != null && value !== "") return value;
  }
  return undefined;
}

function usdLabel(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "$0.00";
  if (value >= 1000) return `$${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  if (value >= 100) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(2)}`;
}

function signedUsd(value: number) {
  if (!Number.isFinite(value) || value === 0) return "$0.00";
  const abs = usdLabel(Math.abs(value));
  return value > 0 ? `+${abs}` : `-${abs}`;
}

function timeAgo(timestamp: number) {
  const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const delta = Math.max(0, Date.now() - ms);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function shortenWallet(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function traderName(row: JsonRow, wallet: string) {
  return String(pick(row, "name", "pseudonym") ?? shortenWallet(wallet)).trim();
}

function avatarOf(row: JsonRow) {
  const value = pick(row, "profileImageOptimized", "profile_image_optimized", "profileImage", "profile_image");
  return typeof value === "string" ? value : null;
}

async function dataGet(path: string, ttlMs = 8_000): Promise<unknown> {
  return polymarketJson(`${DATA}${path}`, ttlMs);
}

export function mapDataTrades(payload: unknown, limit: number): LiveTrade[] {
  return rowsOf(payload)
    .slice(0, limit)
    .map((row, index) => {
      const price = num(pick(row, "price"));
      const size = num(pick(row, "size"));
      const invested = size * price;
      const chance = Math.max(1, Math.min(99, Math.round(price * 100)));
      const outcome = String(pick(row, "outcome", "side") ?? "Yes").trim();
      const side = String(pick(row, "side") ?? "");
      const up = /^(yes|up|buy)$/i.test(outcome) || side.toUpperCase() === "BUY";
      const wallet = String(pick(row, "proxyWallet", "proxy_wallet", "wallet") ?? "unknown");
      const slug = String(pick(row, "slug", "eventSlug", "event_slug", "conditionId", "condition_id") ?? wallet);
      const hash = String(pick(row, "transactionHash", "transaction_hash") ?? `${slug}-${pick(row, "timestamp")}-${index}`);
      return {
        id: hash,
        marketId: slug,
        trader: traderName(row, wallet),
        avatar: avatarOf(row),
        ago: timeAgo(num(pick(row, "timestamp"))),
        invested: usdLabel(invested),
        payout: usdLabel(size),
        title: String(pick(row, "title") ?? slug),
        icon: typeof pick(row, "icon") === "string" ? String(pick(row, "icon")) : null,
        side: `${outcome} at ${chance}% probability`,
        chance,
        up,
      };
    });
}

export function mapDataPositions(payload: unknown, limit: number): VenueTraderPosition[] {
  return rowsOf(payload)
    .slice(0, limit)
    .map((row, index) => {
      const size = num(pick(row, "currentSize", "current_size", "size"));
      const avg = num(pick(row, "avgPrice", "avg_price"));
      const current = num(pick(row, "currentPrice", "current_price"));
      const value = num(pick(row, "currentValue", "current_value", "value"));
      const pnl = num(pick(row, "totalPnl", "total_pnl", "unrealizedPnl", "unrealized_pnl"));
      const pct = num(pick(row, "percentPnl", "percent_pnl"));
      const slug = String(pick(row, "slug", "eventSlug", "event_slug", "conditionId", "condition_id") ?? `pos-${index}`);
      const token = String(pick(row, "assetId", "asset_id", "token_id", "tokenId") ?? index);
      const outcome = String(pick(row, "outcome") ?? "Yes");
      return {
        id: `${slug}:${token}`,
        marketId: slug,
        title: String(pick(row, "title") ?? slug),
        outcome,
        shares: size.toFixed(2),
        avgPrice: `${Math.round(avg * 100)}¢`,
        currentPrice: `${Math.round(current * 100)}¢`,
        value: usdLabel(value || size * current),
        pnl: signedUsd(pnl),
        pnlPct: Number.isFinite(pct) && pct !== 0 ? `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%` : "0.0%",
        up: pnl >= 0,
        icon: typeof pick(row, "icon") === "string" ? String(pick(row, "icon")) : null,
      };
    });
}

export function mapDataHolders(payload: unknown, marketId: string, limit: number): VenueHolder[] {
  const groups = rowsOf(payload);
  const flat: JsonRow[] = [];
  for (const group of groups) {
    const outcomeHint = String(pick(group, "outcome") ?? "");
    const holders = Array.isArray(group.holders) ? group.holders.filter(isRow) : [group];
    for (const holder of holders) {
      flat.push(outcomeHint && !pick(holder, "outcome") ? { ...holder, outcome: outcomeHint } : holder);
    }
  }
  return flat.slice(0, limit).map((row, index) => {
    const wallet = String(pick(row, "wallet", "proxyWallet", "proxy_wallet") ?? `holder-${index}`);
    const amount = num(pick(row, "amount", "currentSize", "current_size"));
    const value = num(pick(row, "currentValue", "current_value"));
    const pnl = num(pick(row, "totalPnl", "total_pnl", "unrealizedPnl", "unrealized_pnl"));
    const price = num(pick(row, "currentPrice", "current_price"));
    const outcome = String(pick(row, "outcome") ?? (num(pick(row, "outcomeIndex", "outcome_index")) === 1 ? "No" : "Yes"));
    return {
      id: `${wallet}:${outcome}:${index}`,
      marketId,
      trader: traderName(row, wallet),
      avatar: avatarOf(row),
      outcome,
      shares: amount.toFixed(2),
      value: usdLabel(value || amount * price),
      pnl: value || pnl ? signedUsd(pnl) : null,
      up: pnl >= 0,
    };
  });
}

export type TradeQuery = {
  limit?: number;
  marketId?: string;
  conditionId?: string;
  user?: string;
};

export async function fetchPolymarketTrades(limitOrQuery: number | TradeQuery = 24): Promise<LiveTrade[]> {
  const query = typeof limitOrQuery === "number" ? { limit: limitOrQuery } : limitOrQuery;
  const limit = Math.min(50, Math.max(1, query.limit ?? 24));
  const legacy = new URLSearchParams({ limit: String(limit) });
  if (query.user) legacy.set("user", query.user);
  if (query.marketId) legacy.set("market", query.marketId);
  if (query.conditionId) legacy.set("market", query.conditionId);
  return mapDataTrades(await dataGet(`/trades?${legacy}`, 8_000), limit);
}

export async function fetchPolymarketPositions(user: string, limit = 40): Promise<VenueTraderPosition[]> {
  const params = new URLSearchParams({
    user,
    limit: String(Math.min(100, Math.max(1, limit))),
    status: "OPEN",
  });
  try {
    return mapDataPositions(await dataGet(`/v2/positions?${params}`, 12_000), limit);
  } catch {
    return mapDataPositions(await dataGet(`/positions?${params}`, 12_000), limit);
  }
}

export async function fetchPolymarketHolders(conditionId: string, limit = 16): Promise<VenueHolder[]> {
  const params = new URLSearchParams({
    condition: conditionId,
    limit: String(Math.min(50, Math.max(1, limit))),
  });
  try {
    return mapDataHolders(await dataGet(`/v2/holders?${params}`, 20_000), conditionId, limit);
  } catch {
    return mapDataHolders(
      await dataGet(`/holders?market=${encodeURIComponent(conditionId)}&limit=${limit}`, 20_000),
      conditionId,
      limit,
    );
  }
}

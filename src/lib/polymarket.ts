import {
  categoryColor,
  formatUsdCompact,
  hashSeed,
  type CategoryId,
  type Market,
} from "@/lib/markets";

const GAMMA = "https://gamma-api.polymarket.com";

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

function mapCategory(tags: string[]): Exclude<CategoryId, "all"> {
  const blob = tags.join(" ").toLowerCase();
  if (/\b(sport|soccer|nba|nfl|mlb|nhl|ufc|tennis|football|laliga|premier|mma)\b/.test(blob)) {
    return "sports";
  }
  if (/\b(crypto|bitcoin|ethereum|btc|eth|solana|defi)\b/.test(blob)) return "crypto";
  if (/\b(politic|election|president|geopolit|congress|trump|fed)\b/.test(blob)) {
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

function yesPrice(market: GammaMarket) {
  const labels = parseList(market.outcomes).map((item) => item.toLowerCase());
  const prices = parseList(market.outcomePrices).map(num);
  const yesIndex = labels.findIndex((label) => label === "yes");
  const price = yesIndex >= 0 ? prices[yesIndex] : prices[0];
  return Math.max(1, Math.min(99, Math.round((price || 0.5) * 100)));
}

function pickMarket(event: GammaEvent) {
  const markets = (event.markets ?? []).filter(
    (item) => item.closed !== true && item.active !== false,
  );
  if (!markets.length) return null;
  const binary = markets.filter((item) => {
    const labels = parseList(item.outcomes).map((label) => label.toLowerCase());
    return labels.includes("yes") && labels.includes("no");
  });
  const pool = binary.length ? binary : markets;
  return [...pool].sort((a, b) => num(b.volume24hr ?? b.volumeNum) - num(a.volume24hr ?? a.volumeNum))[0];
}

function toMarket(event: GammaEvent, raw: GammaMarket): Market | null {
  const slug = raw.slug || event.slug;
  if (!slug) return null;
  const tags = (event.tags ?? []).map((tag) => tag.label || tag.slug || "").filter(Boolean);
  const category = mapCategory(tags);
  const yes = yesPrice(raw);
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

  const title =
    event.markets?.length === 1
      ? event.title || raw.question || slug
      : raw.question || event.title || slug;

  const seed = hashSeed(slug);
  return {
    id: slug,
    title,
    category,
    tag: event.ticker || tags[0]?.toLowerCase().replace(/\s+/g, "-") || "live",
    staked: formatUsdCompact(volume),
    tables: Math.max(1, Math.round(liquidity / 80_000) || 3),
    openSeats: accepting ? 1 : 0,
    resolvesIn: resolvesIn(end),
    resolvesAt: resolvesAt(end),
    wagers: Math.max(1, raw.commentCount ?? (Math.round(volume24 / 12_000) || 4)),
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
    clobTokenIds: parseList(raw.clobTokenIds),
    tableOptions: [
      { id: "t1", stake: "0.05 SOL", full: !accepting },
      { id: "t2", stake: "0.10 SOL", full: false },
      { id: "t3", stake: "0.25 SOL", full: false },
    ],
    seats: [
      {
        id: "A",
        wallet: "Yes",
        avatar: `${slug}-yes`,
        chance: yes,
        side: "lands",
      },
      {
        id: "B",
        wallet: "No",
        avatar: `${slug}-no`,
        chance: Math.max(1, 100 - yes),
        side: "misses",
      },
    ],
  };
}

async function gamma<T>(path: string): Promise<T> {
  const response = await fetch(`${GAMMA}${path}`, {
    headers: {
      accept: "application/json",
      "user-agent": "VEYRAMarkets/0.1 (read-only market discovery)",
    },
    next: { revalidate: 45 },
  });
  if (!response.ok) {
    throw new Error(`Polymarket ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchPolymarketMarkets(limit = 36): Promise<Market[]> {
  const events = await gamma<GammaEvent[]>(
    `/events?active=true&closed=false&limit=${Math.min(60, limit + 12)}&order=volume24hr&ascending=false`,
  );
  const mapped: Market[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const raw = pickMarket(event);
    if (!raw) continue;
    const market = toMarket(event, raw);
    if (!market || seen.has(market.id)) continue;
    seen.add(market.id);
    mapped.push(market);
    if (mapped.length >= limit) break;
  }
  return mapped;
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
  } catch {
    // try events next
  }
  try {
    const events = await gamma<GammaEvent[]>(`/events?slug=${slug}&limit=1`);
    const event = events[0];
    if (!event) return null;
    const raw = pickMarket(event);
    return raw ? toMarket(event, raw) : null;
  } catch {
    return null;
  }
}

const DATA = "https://data-api.polymarket.com";

type DataTrade = {
  proxyWallet?: string;
  side?: string;
  asset?: string;
  conditionId?: string;
  size?: number | string;
  price?: number | string;
  timestamp?: number | string;
  title?: string;
  slug?: string;
  icon?: string;
  outcome?: string;
  name?: string;
  pseudonym?: string;
  profileImage?: string;
  profileImageOptimized?: string;
  transactionHash?: string;
};

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

function usdLabel(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "$0.00";
  if (value >= 1000) return `$${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  if (value >= 100) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(2)}`;
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

export async function fetchPolymarketTrades(limit = 24): Promise<LiveTrade[]> {
  const url = `${DATA}/trades?limit=${Math.min(50, Math.max(8, limit))}`;
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "VEYRAMarkets/0.1 (read-only trade tape)",
    },
    next: { revalidate: 8 },
  });
  if (!response.ok) {
    throw new Error(`Polymarket trades ${response.status}`);
  }
  const rows = (await response.json()) as DataTrade[];
  if (!Array.isArray(rows)) return [];

  return rows.slice(0, limit).map((row, index) => {
    const price = num(row.price);
    const size = num(row.size);
    const invested = size * price;
    const payout = size;
    const chance = Math.max(1, Math.min(99, Math.round(price * 100)));
    const outcome = (row.outcome || row.side || "Yes").trim();
    const up = /^(yes|up|buy)$/i.test(outcome) || row.side === "BUY";
    const wallet = row.proxyWallet || "unknown";
    const trader = (row.name || row.pseudonym || shortenWallet(wallet)).trim();
    const slug = row.slug || row.conditionId || wallet;
    return {
      id: row.transactionHash || `${slug}-${row.timestamp}-${index}`,
      marketId: slug,
      trader,
      avatar: row.profileImageOptimized || row.profileImage || null,
      ago: timeAgo(num(row.timestamp)),
      invested: usdLabel(invested),
      payout: usdLabel(payout),
      title: row.title || slug,
      icon: row.icon || null,
      side: `${outcome} at ${chance}% probability`,
      chance,
      up,
    };
  });
}

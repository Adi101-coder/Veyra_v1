export const categories = [
  { id: "all", label: "All", color: "#1a1a1a" },
  { id: "politics", label: "Politics", color: "#c45c5c" },
  { id: "finance", label: "Finance", color: "#3d9a62" },
  { id: "sports", label: "Sports", color: "#c4a02a" },
  { id: "entertainment", label: "Entertainment", color: "#8a5bb5" },
  { id: "science", label: "Science & Technology", color: "#4a8ec4" },
  { id: "culture", label: "Culture & Society", color: "#c47a3a" },
  { id: "weather", label: "Weather & Nature", color: "#3aa38a" },
] as const;

export type CategoryId = (typeof categories)[number]["id"];

export type TableOption = {
  id: string;
  stake: string;
  full: boolean;
};

export type Seat = {
  id: "A" | "B";
  wallet: string;
  avatar: string;
  chance: number;
  side: "lands" | "misses";
};

export type Market = {
  id: string;
  title: string;
  category: Exclude<CategoryId, "all">;
  tag: string;
  staked: string;
  tables: number;
  openSeats: number;
  resolvesIn: string;
  resolvesAt: string;
  wagers: number;
  status: "trending" | "new" | "open" | "soon" | "resolved";
  accent: string;
  tableOptions: TableOption[];
  seats: Seat[];
  featured?: boolean;
};

export const coreMarkets: Market[] = [
  {
    id: "jimothy",
    title: "Second Jimothy confirmed by end of year?",
    category: "weather",
    tag: "seattle",
    staked: "1.92 SOL",
    tables: 16,
    openSeats: 0,
    resolvesIn: "107d",
    resolvesAt: "1:20 PM Jan 1, 2027",
    wagers: 16,
    status: "trending",
    accent: "#3aa38a",
    featured: true,
    tableOptions: [
      { id: "t1", stake: "0.04 SOL", full: true },
      { id: "t2", stake: "0.04 SOL", full: false },
      { id: "t3", stake: "0.05 SOL", full: true },
      { id: "t4", stake: "0.10 SOL", full: true },
    ],
    seats: [
      {
        id: "A",
        wallet: "4UQy...YVBZ",
        avatar: "a",
        chance: 85,
        side: "lands",
      },
      {
        id: "B",
        wallet: "HbRK...u2AU",
        avatar: "b",
        chance: 12,
        side: "misses",
      },
    ],
  },
  {
    id: "hype",
    title: "Hype goes sub-$50 by end of year?",
    category: "finance",
    tag: "scq",
    staked: "0.48 SOL",
    tables: 3,
    openSeats: 1,
    resolvesIn: "107d",
    resolvesAt: "1:20 PM Jan 1, 2027",
    wagers: 3,
    status: "new",
    accent: "#3d9a62",
    featured: true,
    tableOptions: [
      { id: "t1", stake: "0.02 SOL", full: true },
      { id: "t2", stake: "0.08 SOL", full: false },
      { id: "t3", stake: "0.16 SOL", full: false },
    ],
    seats: [
      {
        id: "A",
        wallet: "7nKx...9ALm",
        avatar: "c",
        chance: 61,
        side: "lands",
      },
      {
        id: "B",
        wallet: "Open seat",
        avatar: "open",
        chance: 39,
        side: "misses",
      },
    ],
  },
  {
    id: "vantage-mcap",
    title: "Will VEYRA's token hit a $5M market cap within its first week?",
    category: "science",
    tag: "vantage",
    staked: "3.10 SOL",
    tables: 8,
    openSeats: 0,
    resolvesIn: "288d",
    resolvesAt: "3:20 PM Jun 20, 2027",
    wagers: 8,
    status: "soon",
    accent: "#4a8ec4",
    featured: true,
    tableOptions: [
      { id: "t1", stake: "0.05 SOL", full: true },
      { id: "t2", stake: "0.25 SOL", full: true },
      { id: "t3", stake: "1.00 SOL", full: false },
    ],
    seats: [
      {
        id: "A",
        wallet: "9pQe...k2Nw",
        avatar: "d",
        chance: 54,
        side: "lands",
      },
      {
        id: "B",
        wallet: "2sRt...m8Vx",
        avatar: "e",
        chance: 46,
        side: "misses",
      },
    ],
  },
  {
    id: "topuria",
    title: "Ilia Topuria wins his next UFC fight",
    category: "sports",
    tag: "topuria-ufc",
    staked: "0.22 SOL",
    tables: 2,
    openSeats: 2,
    resolvesIn: "472d",
    resolvesAt: "1:20 PM Jan 1, 2028",
    wagers: 2,
    status: "open",
    accent: "#c4a02a",
    tableOptions: [
      { id: "t1", stake: "0.05 SOL", full: false },
      { id: "t2", stake: "0.10 SOL", full: false },
    ],
    seats: [
      {
        id: "A",
        wallet: "Open seat",
        avatar: "open",
        chance: 50,
        side: "lands",
      },
      {
        id: "B",
        wallet: "Open seat",
        avatar: "open",
        chance: 50,
        side: "misses",
      },
    ],
  },
  {
    id: "sumo",
    title: "Aonishiki scores kachi-koshi by end of 2026?",
    category: "sports",
    tag: "sumo",
    staked: "0.90 SOL",
    tables: 6,
    openSeats: 0,
    resolvesIn: "107d",
    resolvesAt: "1:20 PM Jan 1, 2027",
    wagers: 6,
    status: "trending",
    accent: "#c4a02a",
    tableOptions: [{ id: "t1", stake: "0.05 SOL", full: true }],
    seats: [
      {
        id: "A",
        wallet: "3kLm...p0Qs",
        avatar: "f",
        chance: 71,
        side: "lands",
      },
      {
        id: "B",
        wallet: "8dFg...r4Ty",
        avatar: "g",
        chance: 29,
        side: "misses",
      },
    ],
  },
  {
    id: "mica",
    title: "Will Binance obtain a MiCA license in the EU by the end of 2026?",
    category: "finance",
    tag: "binance-mica",
    staked: "0.12 SOL",
    tables: 1,
    openSeats: 1,
    resolvesIn: "107d",
    resolvesAt: "1:20 PM Jan 1, 2027",
    wagers: 1,
    status: "open",
    accent: "#3d9a62",
    tableOptions: [{ id: "t1", stake: "0.12 SOL", full: false }],
    seats: [
      {
        id: "A",
        wallet: "5wEr...n7Ui",
        avatar: "h",
        chance: 58,
        side: "lands",
      },
      {
        id: "B",
        wallet: "Open seat",
        avatar: "open",
        chance: 42,
        side: "misses",
      },
    ],
  },
  {
    id: "worldcup",
    title: "Will France defeat Spain in the FIFA World Cup 2026 Quarter-final?",
    category: "sports",
    tag: "wc2026",
    staked: "0.20 SOL",
    tables: 1,
    openSeats: 0,
    resolvesIn: "302d",
    resolvesAt: "3:20 AM Jul 16, 2027",
    wagers: 1,
    status: "soon",
    accent: "#c4a02a",
    tableOptions: [{ id: "t1", stake: "0.20 SOL", full: true }],
    seats: [
      {
        id: "A",
        wallet: "6yHj...b3Cd",
        avatar: "i",
        chance: 52,
        side: "lands",
      },
      {
        id: "B",
        wallet: "1zXc...v9Bn",
        avatar: "j",
        chance: 48,
        side: "misses",
      },
    ],
  },
  {
    id: "parimutuel",
    title: '"Parimutuel" becomes a buzzword in prediction markets in 2026',
    category: "culture",
    tag: "lingo",
    staked: "0.06 SOL",
    tables: 1,
    openSeats: 0,
    resolvesIn: "107d",
    resolvesAt: "1:20 PM Jan 1, 2027",
    wagers: 1,
    status: "trending",
    accent: "#c47a3a",
    tableOptions: [{ id: "t1", stake: "0.06 SOL", full: true }],
    seats: [
      {
        id: "A",
        wallet: "0aSd...f2Gh",
        avatar: "k",
        chance: 40,
        side: "lands",
      },
      {
        id: "B",
        wallet: "9jKl...p4Qw",
        avatar: "l",
        chance: 60,
        side: "misses",
      },
    ],
  },
  {
    id: "election",
    title: "Will turnout exceed 65% in the next US midterm election?",
    category: "politics",
    tag: "midterms",
    staked: "2.40 SOL",
    tables: 11,
    openSeats: 3,
    resolvesIn: "410d",
    resolvesAt: "9:00 AM Nov 8, 2026",
    wagers: 11,
    status: "open",
    accent: "#c45c5c",
    tableOptions: [
      { id: "t1", stake: "0.10 SOL", full: true },
      { id: "t2", stake: "0.25 SOL", full: false },
    ],
    seats: [
      {
        id: "A",
        wallet: "4mNb...s8Df",
        avatar: "m",
        chance: 47,
        side: "lands",
      },
      {
        id: "B",
        wallet: "Open seat",
        avatar: "open",
        chance: 53,
        side: "misses",
      },
    ],
  },
  {
    id: "oscars",
    title: "A streaming original wins Best Picture at the next Oscars?",
    category: "entertainment",
    tag: "oscars",
    staked: "0.70 SOL",
    tables: 4,
    openSeats: 0,
    resolvesIn: "160d",
    resolvesAt: "8:00 PM Mar 15, 2027",
    wagers: 4,
    status: "new",
    accent: "#8a5bb5",
    tableOptions: [{ id: "t1", stake: "0.08 SOL", full: true }],
    seats: [
      {
        id: "A",
        wallet: "2qWe...t5Ry",
        avatar: "n",
        chance: 33,
        side: "lands",
      },
      {
        id: "B",
        wallet: "7uIo...p1As",
        avatar: "o",
        chance: 67,
        side: "misses",
      },
    ],
  },
];

export const tabs = [
  { id: "trending", label: "Trending" },
  { id: "new", label: "New" },
  { id: "open", label: "Open seats" },
  { id: "soon", label: "Resolving soon" },
  { id: "resolved", label: "Resolved" },
] as const;

export type TabId = (typeof tabs)[number]["id"];

export const SOL_USD = 100.24;

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const SHORT_MONTHS = [
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

export type SeatNote = "LOCKED" | "OPEN" | "LANDED" | "MISSED" | "PUSH";

export type WagerRow = {
  id: string;
  stake: string;
  gold: string;
  lockBy: string;
  mechanism: "Peer";
  resolution: "PENDING" | "RESOLVED";
  expired: boolean;
  left: { wallet: string; avatar: string; belief: number; note: SeatNote };
  right: { wallet: string; avatar: string; belief: number; note: SeatNote };
};

export function getMarket(id: string) {
  return markets.find((market) => market.id === id) ?? null;
}

export function getWager(marketId: string, wagerId: string) {
  const market = getMarket(marketId);
  if (!market) return null;
  const wager = marketWagers(market).find((row) => row.id === wagerId);
  if (!wager) return null;
  return { market, wager };
}

export function wagerAddress(wagerId: string) {
  return fakePubkey(`wager:${wagerId}`);
}

export function parseStakeSol(stake: string) {
  const value = Number.parseFloat(stake);
  return Number.isFinite(value) ? value : 0;
}

export function formatResolvesParts(resolvesAt: string) {
  const match = resolvesAt.match(
    /^(\d{1,2}):(\d{2})\s*([AP]M)\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/i,
  );
  if (!match) {
    return { date: resolvesAt, time: "" };
  }
  const [, hour, minute, mer, month, day, year] = match;
  return {
    date: `${month} ${day}, ${year}`,
    time: `${hour.padStart(2, "0")}:${minute} ${mer.toUpperCase()}`,
  };
}

export function wagerCreatedParts(wagerId: string) {
  const n = hashSeed(`wager-created:${wagerId}`);
  const month = SHORT_MONTHS[n % 8];
  const day = 1 + (n % 28);
  const hour = 1 + (n % 11);
  const minute = (n % 6) * 10;
  const mer = n % 2 === 0 ? "AM" : "PM";
  return {
    date: `${month} ${day}, 2026`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${mer}`,
  };
}

export function hashSeed(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function fakePubkey(seed: string, length = 44) {
  let h = hashSeed(seed);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    out += BASE58[h % 58];
  }
  return out;
}

export function shortenKey(key: string, left = 4, right = 4) {
  if (key.length <= left + right + 3) return key;
  return `${key.slice(0, left)}...${key.slice(-right)}`;
}

function seatsFor(id: string, yes: number, leftOpen = false, rightOpen = false): Seat[] {
  return [
    {
      id: "A",
      wallet: leftOpen ? "Open seat" : shortenKey(fakePubkey(`L:${id}`)),
      avatar: `${id}-a`,
      chance: yes,
      side: "lands",
    },
    {
      id: "B",
      wallet: rightOpen ? "Open seat" : shortenKey(fakePubkey(`R:${id}`)),
      avatar: `${id}-b`,
      chance: Math.max(1, 100 - yes),
      side: "misses",
    },
  ];
}

function discoveryMarket(
  id: string,
  title: string,
  category: Exclude<CategoryId, "all">,
  tag: string,
  yes: number,
  extras: Partial<
    Pick<
      Market,
      "staked" | "tables" | "openSeats" | "resolvesIn" | "resolvesAt" | "wagers" | "status" | "featured"
    >
  > = {},
): Market {
  const accents: Record<Exclude<CategoryId, "all">, string> = {
    politics: "#c45c5c",
    finance: "#3d9a62",
    sports: "#c4a02a",
    entertainment: "#8a5bb5",
    science: "#4a8ec4",
    culture: "#c47a3a",
    weather: "#3aa38a",
  };
  const openSeats = extras.openSeats ?? 0;
  return {
    id,
    title,
    category,
    tag,
    staked: extras.staked ?? "0.84 SOL",
    tables: extras.tables ?? 5,
    openSeats,
    resolvesIn: extras.resolvesIn ?? "1d",
    resolvesAt: extras.resolvesAt ?? "12:30 AM Sep 19, 2026",
    wagers: extras.wagers ?? 5,
    status: extras.status ?? "open",
    accent: accents[category],
    featured: extras.featured,
    tableOptions: [{ id: "t1", stake: "0.10 SOL", full: openSeats === 0 }],
    seats: seatsFor(id, yes, openSeats > 1, openSeats > 0),
  };
}

const discoveryMarkets: Market[] = [
  discoveryMarket(
    "frech-dolehide",
    "Magdalena Frech vs Caroline Dolehide",
    "sports",
    "gdl-open",
    66,
    {
      staked: "4.20 SOL",
      tables: 18,
      openSeats: 0,
      resolvesIn: "8h",
      resolvesAt: "12:40 AM Sep 17, 2026",
      wagers: 18,
      status: "trending",
      featured: true,
    },
  ),
  discoveryMarket("everton-wolves", "Everton vs Wolves — Everton to win", "sports", "ffl-cup", 68, {
    resolvesAt: "12:15 AM Sep 17, 2026",
    status: "trending",
  }),
  discoveryMarket("mcity-brighton", "Manchester United vs Brighton — United to win", "sports", "ffl-cup", 62, {
    resolvesAt: "12:30 AM Sep 17, 2026",
  }),
  discoveryMarket("coventry-villa", "Coventry vs Aston Villa — Coventry to win", "sports", "ffl-cup", 28, {
    resolvesAt: "12:30 AM Sep 17, 2026",
    openSeats: 1,
  }),
  discoveryMarket("wolves-everton", "Everton vs Wolves — Wolves to win", "sports", "europa", 15, {
    resolvesAt: "12:15 AM Sep 17, 2026",
  }),
  discoveryMarket("mcity-norwich", "Manchester City vs Norwich — City to win", "sports", "europa", 92, {
    resolvesAt: "12:00 AM Sep 17, 2026",
    status: "trending",
  }),
  discoveryMarket("palace-leech", "Crystal Palace vs Lech Poznan — Palace to win", "sports", "europa", 75, {
    resolvesAt: "12:30 AM Sep 18, 2026",
    resolvesIn: "2d",
  }),
  discoveryMarket("olympiakos-anderlecht", "Olympiakos vs Anderlecht — Olympiakos to win", "sports", "europa", 77, {
    resolvesAt: "12:30 AM Sep 17, 2026",
  }),
  discoveryMarket("anderlecht-lyon", "Anderlecht vs Lyon — Anderlecht to win", "sports", "europa", 35, {
    resolvesAt: "12:30 AM Sep 17, 2026",
  }),
  discoveryMarket("sunderland-alkmaar", "Sunderland vs AZ Alkmaar — Sunderland to win", "sports", "europa", 69, {
    resolvesAt: "12:30 AM Sep 17, 2026",
  }),
  discoveryMarket("villa-coventry", "Aston Villa vs Coventry — Villa to win", "sports", "ffl-cup", 51, {
    resolvesAt: "12:15 AM Sep 17, 2026",
  }),
  discoveryMarket("hoffenheim-bournemouth", "Hoffenheim vs Bournemouth — Hoffenheim to win", "sports", "europa", 75, {
    resolvesAt: "10:15 AM Sep 17, 2026",
  }),
  discoveryMarket("bournemouth-sociedad", "Bournemouth vs Real Sociedad — Bournemouth to win", "sports", "europa", 31, {
    resolvesAt: "12:30 AM Sep 18, 2026",
    resolvesIn: "2d",
  }),
  discoveryMarket("union-pizen", "Union St. Gilloise vs Viktoria Plzen — Union to win", "sports", "europa", 41, {
    resolvesAt: "12:30 AM Sep 18, 2026",
    resolvesIn: "2d",
  }),
  discoveryMarket("cl-golden-boot", "Champions League Golden Boot — Kylian Mbappe", "sports", "ucl", 21, {
    resolvesIn: "280d",
    resolvesAt: "8:00 PM Jun 1, 2027",
    status: "open",
    tables: 9,
    wagers: 9,
  }),
  discoveryMarket("cl-champion-barca", "UEFA Champions League 2027 Champion — Barcelona", "sports", "ucl", 20, {
    resolvesIn: "280d",
    resolvesAt: "8:00 PM Jun 1, 2027",
    tables: 12,
    wagers: 12,
  }),
  discoveryMarket("brentford-chelsea", "Brentford vs Chelsea", "sports", "epl", 35, {
    resolvesIn: "3d",
    resolvesAt: "12:30 AM Sep 19, 2026",
    status: "trending",
  }),
  discoveryMarket("spurs-villa", "Tottenham vs Aston Villa", "sports", "epl", 49, {
    resolvesIn: "3d",
    resolvesAt: "5:00 PM Sep 19, 2026",
  }),
  discoveryMarket("newcastle-hull", "Newcastle vs Hull City", "sports", "epl", 62, {
    resolvesIn: "3d",
    resolvesAt: "7:30 AM Sep 19, 2026",
  }),
  discoveryMarket("everton-ipswich", "Everton vs Ipswich", "sports", "epl", 57, {
    resolvesIn: "3d",
    resolvesAt: "7:30 PM Sep 19, 2026",
  }),
  discoveryMarket("exrustec-nexus-m1", "ex-RUSTEC vs Nexus: Map 1 Winner", "sports", "cs2", 42, {
    resolvesIn: "2h",
    resolvesAt: "10:30 PM Sep 16, 2026",
    status: "trending",
    featured: true,
  }),
  discoveryMarket("exrustec-nexus-m2", "ex-RUSTEC vs Nexus: Map 2 Winner", "sports", "cs2", 53, {
    resolvesIn: "4h",
    resolvesAt: "10:30 PM Sep 16, 2026",
    status: "trending",
  }),
  discoveryMarket("b8-metizport", "B8 vs Metizport", "sports", "cs2", 70, {
    resolvesIn: "1d",
    resolvesAt: "1:30 PM Sep 17, 2026",
  }),
  discoveryMarket("tope-invictus", "Top Esports vs Invictus Gaming", "sports", "dota2", 47, {
    resolvesIn: "1d",
    resolvesAt: "2:30 PM Sep 17, 2026",
  }),
  discoveryMarket("gamerlegion-luminosity", "GamerLegion vs Luminosity", "sports", "cs2", 57, {
    resolvesIn: "1d",
    resolvesAt: "2:30 PM Sep 17, 2026",
  }),
  discoveryMarket("nip-m80", "NIP vs M80", "sports", "cs2", 55, {
    resolvesIn: "1d",
    resolvesAt: "2:30 PM Sep 17, 2026",
  }),
  discoveryMarket("mouz-nrg", "MOUZ vs NRG", "sports", "cs2", 88, {
    resolvesIn: "1d",
    resolvesAt: "3:30 PM Sep 17, 2026",
    status: "trending",
  }),
  discoveryMarket("stearns-stephens", "Peyton Stearns vs Sloane Stephens", "sports", "gdl-open", 58, {
    resolvesAt: "11:40 AM Sep 17, 2026",
  }),
  discoveryMarket("sonmez-jovic", "Zeynep Sonmez vs Iva Jovic", "sports", "gdl-open", 47, {
    resolvesAt: "5:50 AM Sep 17, 2026",
  }),
  discoveryMarket("kostyuk-townsend", "Marta Kostyuk vs Taylor Townsend", "sports", "gdl-open", 61, {
    resolvesAt: "5:30 AM Sep 17, 2026",
  }),
  discoveryMarket("day-samsonova", "Kayla Day vs Liudmila Samsonova", "sports", "gdl-open", 39, {
    resolvesAt: "11:40 AM Sep 17, 2026",
  }),
  discoveryMarket("bucsa-sorribes", "Cristina Bucsa vs Sara Sorribes Tormo", "sports", "gdl-open", 44, {
    resolvesAt: "11:40 AM Sep 17, 2026",
  }),
  discoveryMarket("sol-weekend", "Solana closes the week above $180", "finance", "sol", 58, {
    resolvesIn: "4d",
    resolvesAt: "5:00 PM Sep 20, 2026",
    status: "new",
  }),
];

export const markets: Market[] = [...coreMarkets, ...discoveryMarkets];

export function marketAddress(market: Market) {
  return fakePubkey(`addr:${market.id}`);
}

export function marketCreator(market: Market) {
  const key = fakePubkey(`creator:${market.id}`);
  return { wallet: key, avatar: `creator-${market.id}` };
}

export function marketCreatedLabel(market: Market) {
  const n = hashSeed(`created:${market.id}`);
  const month = SHORT_MONTHS[n % 8];
  const day = 1 + (n % 28);
  return `${month} ${day}, 2026`;
}

export function formatResolvesBy(resolvesAt: string) {
  const match = resolvesAt.match(
    /^(\d{1,2}):(\d{2})\s*([AP]M)\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/i,
  );
  if (!match) return resolvesAt;
  const [, hour, minute, mer, month, day, year] = match;
  const full =
    MONTHS[SHORT_MONTHS.findIndex((item) => item.toLowerCase() === month.toLowerCase())] ??
    month;
  return `${full} ${day}, ${year} at ${hour.padStart(2, "0")}:${minute} ${mer.toUpperCase()}`;
}

export function formatUsd(sol: number) {
  return `$${(sol * SOL_USD).toFixed(2)}`;
}

function walletFromSeed(seed: string) {
  return fakePubkey(seed, 44);
}

export function marketWagers(market: Market): WagerRow[] {
  const count = Math.max(market.wagers, 1);
  return Array.from({ length: count }, (_, index) => {
    const n = hashSeed(`${market.id}:wager:${index}`);
    const leftBelief =
      index === 0 ? (market.seats[0]?.chance ?? 52 + (n % 44)) : 52 + (n % 44);
    const rightBelief =
      index === 0
        ? (market.seats[1]?.chance ?? Math.max(4, 100 - leftBelief - (n % 5)))
        : Math.max(4, 100 - leftBelief - (n % 5));
    const table = market.tableOptions[index % market.tableOptions.length];
    const filled = table?.full || index % 4 !== 1;
    const resolved = index % 9 === 3;
    const expired = index % 8 === 5;
    const leftKey = index === 0 ? market.seats[0]?.wallet : shortenKey(walletFromSeed(`${market.id}:L:${index}`));
    const rightKey = index === 0 ? market.seats[1]?.wallet : shortenKey(walletFromSeed(`${market.id}:R:${index}`));

    return {
      id: `${market.id}-w${index + 1}`,
      stake: table?.stake ?? "0.10 SOL",
      gold: filled ? "2/2" : "1/2",
      lockBy: expired ? "Expired" : filled ? "Locked" : "Open",
      mechanism: "Peer",
      resolution: resolved ? "RESOLVED" : "PENDING",
      expired,
      left: {
        wallet: leftKey && leftKey !== "Open seat" ? leftKey : "Open seat",
        avatar: `${market.id}-L-${index}`,
        belief: leftBelief,
        note: filled ? "LOCKED" : "OPEN",
      },
      right: {
        wallet: rightKey && rightKey !== "Open seat" ? rightKey : "Open seat",
        avatar: filled ? `${market.id}-R-${index}` : "open",
        belief: rightBelief,
        note: filled ? (index === 0 ? "LANDED" : "LOCKED") : "OPEN",
      },
    };
  });
}

export function categoryLabel(id: Exclude<CategoryId, "all">) {
  return categories.find((c) => c.id === id)?.label ?? id;
}

export function categoryColor(id: Exclude<CategoryId, "all">) {
  return categories.find((c) => c.id === id)?.color ?? "#1a1a1a";
}

export function filterMarkets(
  list: Market[],
  tab: TabId,
  category: CategoryId,
  query: string,
) {
  const q = query.trim().toLowerCase();
  return list.filter((market) => {
    const tabOk =
      tab === "trending"
        ? market.status !== "resolved"
        : tab === "new"
          ? market.status === "new"
          : tab === "open"
            ? market.openSeats > 0
            : tab === "soon"
              ? market.status === "soon" || parseInt(market.resolvesIn, 10) <= 160
              : market.status === "resolved";
    const catOk = category === "all" || market.category === category;
    const queryOk =
      !q ||
      market.title.toLowerCase().includes(q) ||
      market.tag.toLowerCase().includes(q);
    return tabOk && catOk && queryOk;
  });
}

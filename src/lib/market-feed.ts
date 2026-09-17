import { hashSeed, type Market } from "@/lib/markets";

export type FeedChannel = "all" | "crypto" | "sport" | "esports" | "finance" | "politics" | "entertainment";

export const feedChannels: { id: FeedChannel; label: string }[] = [
  { id: "all", label: "All" },
  { id: "crypto", label: "Crypto" },
  { id: "sport", label: "Sport" },
  { id: "esports", label: "Esports" },
  { id: "finance", label: "Finance" },
  { id: "politics", label: "Politics" },
  { id: "entertainment", label: "Entertainment" },
];

export type Crest = {
  initials: string;
  color: string;
  ink?: string;
  flag?: string;
  image?: string;
  shape?: "circle" | "shield" | "hex";
};

export type FeedSide = {
  name: string;
  crest: Crest;
  chance: number;
};

export type FeaturedPosition = {
  trader: string;
  avatar: string;
  side: string;
  chance: number;
  amount: string;
  delta: string;
  up: boolean;
};

export type LovedMarket = {
  marketId: string;
  league: string;
  title: string;
  when: string;
  photo: string;
};

export type PackLeg = {
  marketId: string;
  team: string;
  opponent: string;
  side: string;
  odd: string;
  crest: Crest;
  when: string;
};

export type Pack = {
  id: string;
  league: string;
  title: string;
  multiplier: string;
  legs: PackLeg[];
};

export type TraderRow = {
  rank: number;
  handle: string;
  avatar: string;
  pnl: string;
  roi: string;
};

export type BiggestPosition = {
  marketId: string;
  title: string;
  trader: string;
  avatar: string;
  mark: string;
  side: string;
  sideTone: "yes" | "no";
  amount: string;
};

export type LivePosition = {
  marketId: string;
  trader: string;
  avatar: string;
  ago: string;
  invested: string;
  payout: string;
  title: string;
  mark: string;
  side: string;
  chance: number;
  up: boolean;
};

export type SportTab = "all" | "football" | "american-football" | "tennis" | "cricket" | "basketball" | "hockey" | "f1";

export type OutrightRunner = {
  marketId: string;
  name: string;
  chance: number;
};

export type OutrightCard = {
  id: string;
  league: string;
  title: string;
  runners: OutrightRunner[];
};

export type MatchCard = {
  marketId: string;
  league: string;
  when: string;
  kickoff: string;
  home: FeedSide;
  away: FeedSide;
  draw?: number;
};

export type LeagueBlock = {
  id: string;
  name: string;
  count: number;
  sport: SportTab;
  outrights: OutrightCard[];
  matches: MatchCard[];
};

export type EsportTab = "all" | "cs2" | "dota2" | "valorant" | "lol";

export type EsportMatch = {
  marketId: string;
  game: EsportTab;
  live?: { home: number; away: number };
  when: string;
  kickoff?: string;
  home: FeedSide;
  away: FeedSide;
};

export function oddFromChance(chance: number) {
  const implied = Math.max(0.08, Math.min(0.92, chance / 100));
  return `${(1 / implied).toFixed(2)}x`;
}

const crest = (
  initials: string,
  color: string,
  extra: Partial<Crest> = {},
): Crest => ({
  initials,
  color,
  shape: extra.shape ?? "shield",
  ...extra,
});

function series(seed: string, start: number, length = 28) {
  let h = hashSeed(seed);
  const values = [start];
  let value = start;
  for (let i = 1; i < length; i += 1) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    value = Math.min(92, Math.max(8, value + ((h % 11) - 5)));
    if (i === 7) value = Math.min(88, value + 18);
    if (i === 8) value = Math.max(12, value - 16);
    values.push(value);
  }
  values[values.length - 1] = start;
  return values;
}

export const featuredEvent = {
  marketId: "frech-dolehide",
  league: "GDL Open",
  when: "Thu, Sep 17 · 12:40 AM",
  clock: "00:40",
  clockLabel: "Thu, Sep 17",
  home: {
    name: "Magdalena Frech",
    short: "M. Frech",
    crest: crest("MF", "#1d4ed8", {
      flag: "PL",
      shape: "circle",
      image: "/images/markets/tennis-player-a.png",
    }),
    chance: 66,
  },
  away: {
    name: "Caroline Dolehide",
    short: "C. Dolehide",
    crest: crest("CD", "#b45309", {
      flag: "US",
      shape: "circle",
      image: "/images/markets/tennis-player-b.png",
    }),
    chance: 34,
  },
  homeSeries: series("frech-line", 48),
  awaySeries: series("dolehide-line", 52).map((value, i, arr) =>
    Math.max(8, 100 - series("frech-line", 48)[i] + (i === arr.length - 1 ? 0 : (value % 3) - 1)),
  ),
  positions: [
    {
      trader: "FoggyMintyPenguin",
      avatar: "/images/markets/trader-1.png",
      side: "Magdalena Frech 62.3¢",
      chance: 62.3,
      amount: "$58.06",
      delta: "+$0.91 (1.6%)",
      up: true,
    },
    {
      trader: "CrimsonRockyMantis",
      avatar: "/images/markets/trader-3.png",
      side: "Caroline Dolehide 37.8¢",
      chance: 37.8,
      amount: "$0.31",
      delta: "+$0.05 (14.6%)",
      up: true,
    },
    {
      trader: "QuietCopperOtter",
      avatar: "/images/markets/trader-2.png",
      side: "Magdalena Frech 68.8¢",
      chance: 68.8,
      amount: "$0.62",
      delta: "-$0.05 (-8.0%)",
      up: false,
    },
  ] satisfies FeaturedPosition[],
  loved: [
    { marketId: "stearns-stephens", league: "GDL Open", title: "Peyton Stearns vs Sloane Stephens", when: "Thu, Sep 17 · 11:40 AM", photo: "/images/markets/tennis-player-c.png" },
    { marketId: "sonmez-jovic", league: "GDL Open", title: "Zeynep Sonmez vs Iva Jovic", when: "Thu, Sep 17 · 05:50 AM", photo: "/images/markets/tennis-player-d.png" },
    { marketId: "kostyuk-townsend", league: "GDL Open", title: "Marta Kostyuk vs Taylor Townsend", when: "Thu, Sep 17 · 05:30 AM", photo: "/images/markets/tennis-player-e.png" },
    { marketId: "day-samsonova", league: "GDL Open", title: "Kayla Day vs Liudmila Samsonova", when: "Thu, Sep 17 · 11:40 AM", photo: "/images/markets/tennis-player-b.png" },
    { marketId: "bucsa-sorribes", league: "GDL Open", title: "Cristina Bucsa vs Sara Sorribes Tormo", when: "Thu, Sep 17 · 11:40 AM", photo: "/images/markets/tennis-player-a.png" },
  ] satisfies LovedMarket[],
};

export const packs: Pack[] = [
  {
    id: "throwback",
    league: "FFL Cup",
    title: "throwback wednesday",
    multiplier: "7.52x",
    legs: [
      { marketId: "everton-wolves", team: "Everton", opponent: "Wolves", side: "YES 68%", odd: "1.47x", crest: crest("EVE", "#003399"), when: "Thu, Sep 17 · 12:15 AM" },
      { marketId: "mcity-brighton", team: "Manchester United", opponent: "Brighton", side: "YES 62%", odd: "1.61x", crest: crest("MUN", "#da291c"), when: "Thu, Sep 17 · 12:30 AM" },
      { marketId: "coventry-villa", team: "Coventry", opponent: "Aston Villa", side: "YES 28%", odd: "3.51x", crest: crest("COV", "#77b6e7"), when: "Thu, Sep 17 · 12:30 AM" },
    ],
  },
  {
    id: "brexit-bonus",
    league: "FFL Cup · UEFA Europa League",
    title: "brexit bonus round",
    multiplier: "8.50x",
    legs: [
      { marketId: "wolves-everton", team: "Wolves", opponent: "Everton", side: "YES 15%", odd: "6.56x", crest: crest("WOL", "#fdb913"), when: "Thu, Sep 17 · 12:15 AM" },
      { marketId: "mcity-norwich", team: "Manchester City", opponent: "Norwich", side: "YES 92%", odd: "1.08x", crest: crest("MCI", "#6cabdd"), when: "Thu, Sep 17 · 12:00 AM" },
      { marketId: "palace-leech", team: "Crystal Palace", opponent: "Lech Poznan", side: "YES 75%", odd: "1.33x", crest: crest("CRY", "#1b458f"), when: "Fri, Sep 18 · 12:30 AM" },
    ],
  },
  {
    id: "zeus-groceries",
    league: "UEFA Europa League",
    title: "zeus carries the groceries",
    multiplier: "4.40x",
    legs: [
      { marketId: "olympiakos-anderlecht", team: "Olympiakos Piraeus", opponent: "Anderlecht", side: "YES 77%", odd: "1.30x", crest: crest("OLY", "#e30613"), when: "Thu, Sep 17 · 12:30 AM" },
      { marketId: "anderlecht-lyon", team: "Anderlecht", opponent: "Lyon", side: "YES 35%", odd: "2.89x", crest: crest("AND", "#5b0b2e"), when: "Thu, Sep 17 · 12:30 AM" },
      { marketId: "sunderland-alkmaar", team: "Sunderland", opponent: "AZ Alkmaar", side: "YES 69%", odd: "1.46x", crest: crest("SUN", "#eb172b"), when: "Thu, Sep 17 · 12:30 AM" },
    ],
  },
  {
    id: "home-advantage",
    league: "FFL Cup · UEFA Europa League",
    title: "home advantage is still a myth",
    multiplier: "13.48x",
    legs: [
      { marketId: "villa-coventry", team: "Aston Villa", opponent: "Coventry", side: "YES 51%", odd: "1.97x", crest: crest("AVL", "#670e36"), when: "Thu, Sep 17 · 12:15 AM" },
      { marketId: "hoffenheim-bournemouth", team: "1899 Hoffenheim", opponent: "Bournemouth", side: "YES 75%", odd: "1.33x", crest: crest("HOF", "#1c63b7"), when: "Thu, Sep 17 · 10:15 AM" },
      { marketId: "bournemouth-sociedad", team: "Bournemouth", opponent: "Real Sociedad", side: "YES 31%", odd: "2.31x", crest: crest("BOU", "#da291c"), when: "Fri, Sep 18 · 12:30 AM" },
      { marketId: "union-pizen", team: "Union St. Gilloise", opponent: "Plzen", side: "YES 41%", odd: "2.47x", crest: crest("USG", "#f5c400"), when: "Fri, Sep 18 · 12:30 AM" },
    ],
  },
];

export const topTraders: TraderRow[] = [
  { rank: 1, handle: "pvmhalache", avatar: "/images/markets/trader-5.png", pnl: "+$1,861.20", roi: "21.9% ROI" },
  { rank: 2, handle: "LushSmallIbis", avatar: "/images/markets/trader-2.png", pnl: "+$1,522.15", roi: "42.0% ROI" },
  { rank: 3, handle: "SatinFabledRavine", avatar: "/images/markets/trader-7.png", pnl: "+$1,248.13", roi: "64.4% ROI" },
];

export const biggestPositions: BiggestPosition[] = [
  { marketId: "sol-weekend", title: "Will Ostium launch a token by December 31, 2026?", trader: "CaramelAiryMustang", avatar: "/images/markets/trader-6.png", mark: "ost", side: "No 50¢", sideTone: "no", amount: "+$135.01" },
  { marketId: "hype", title: "SpaceX (SPCX) Up or Down · Daily", trader: "SharpLunarNarwhal", avatar: "/images/markets/trader-4.png", mark: "spx", side: "Yes 73¢", sideTone: "yes", amount: "+$114.22" },
  { marketId: "mica", title: "Fed Decision in September?", trader: "FoggyMintyPenguin", avatar: "/images/markets/trader-1.png", mark: "fed", side: "No change 69¢", sideTone: "no", amount: "+$108.60" },
];

export const trendingPositions: LivePosition[] = [
  { marketId: "hype", trader: "MossyScarletFalcon", avatar: "/images/markets/trader-3.png", ago: "1h ago", invested: "$102.91", payout: "$256.62", title: "Amazon (AMZN) Up or Down", mark: "amzn", side: "Up at 40% probability", chance: 40, up: true },
  { marketId: "mica", trader: "JollyWinningKite", avatar: "/images/markets/trader-4.png", ago: "1h ago", invested: "$58.01", payout: "$214.85", title: "S&P 500 ETF (SPY) Up or Down", mark: "spy", side: "Down at 27% probability", chance: 27, up: false },
  { marketId: "sol-weekend", trader: "nbvcxwm1kjh", avatar: "/images/markets/trader-5.png", ago: "1h ago", invested: "$89.90", payout: "$100.00", title: "US national Bitcoin reserve before 2027", mark: "btc", side: "No at 90% probability", chance: 90, up: false },
  { marketId: "vantage-mcap", trader: "AiryGlossyWildcat", avatar: "/images/markets/trader-6.png", ago: "1h ago", invested: "$42.86", payout: "$291.59", title: "Tesla (TSLA) Up or Down · Daily", mark: "tsla", side: "Down at 15% probability", chance: 15, up: false },
  { marketId: "election", trader: "QuietCopperOtter", avatar: "/images/markets/trader-2.png", ago: "2h ago", invested: "$38.40", payout: "$121.10", title: "ETH prints five thousand before year end", mark: "eth", side: "Yes at 44% probability", chance: 44, up: true },
];

export const sportTabs: { id: SportTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "football", label: "Football" },
  { id: "american-football", label: "American Football" },
  { id: "tennis", label: "Tennis" },
  { id: "cricket", label: "Cricket" },
  { id: "basketball", label: "Basketball" },
  { id: "hockey", label: "Hockey" },
  { id: "f1", label: "Formula 1" },
];

export const sportLeagues: LeagueBlock[] = [
  {
    id: "ucl",
    name: "UEFA Champions League",
    count: 2,
    sport: "football",
    outrights: [
      {
        id: "golden-boot",
        league: "UEFA Champions League",
        title: "Champions League Golden Boot",
        runners: [
          { marketId: "cl-golden-boot", name: "Kylian Mbappe", chance: 21.3 },
          { marketId: "cl-golden-boot", name: "Erling Haaland", chance: 17 },
          { marketId: "cl-golden-boot", name: "Harry Kane", chance: 10.1 },
        ],
      },
      {
        id: "cl-champ",
        league: "UEFA Champions League",
        title: "UEFA Champions League: 2027 Champion",
        runners: [
          { marketId: "cl-champion-barca", name: "Barcelona", chance: 19.5 },
          { marketId: "cl-champion-barca", name: "Bayern Munich", chance: 15.6 },
          { marketId: "cl-champion-barca", name: "Arsenal", chance: 14.5 },
        ],
      },
    ],
    matches: [],
  },
  {
    id: "epl",
    name: "English Premier League",
    count: 4,
    sport: "football",
    outrights: [],
    matches: [
      {
        marketId: "brentford-chelsea",
        league: "EPL",
        when: "Sat, Sep 19",
        kickoff: "12:30 AM",
        home: { name: "Brentford", crest: crest("BRE", "#e30613"), chance: 35.4 },
        away: { name: "Chelsea", crest: crest("CHE", "#034694"), chance: 43 },
        draw: 26,
      },
      {
        marketId: "spurs-villa",
        league: "EPL",
        when: "Sat, Sep 19",
        kickoff: "05:00 PM",
        home: { name: "Tottenham", crest: crest("TOT", "#132257"), chance: 49.4 },
        away: { name: "Aston Villa", crest: crest("AVL", "#670e36"), chance: 27 },
        draw: 28,
      },
      {
        marketId: "newcastle-hull",
        league: "EPL",
        when: "Sat, Sep 19",
        kickoff: "07:30 AM",
        home: { name: "Newcastle", crest: crest("NEW", "#241f20"), chance: 61.7 },
        away: { name: "Hull City", crest: crest("HUL", "#f5a81c"), chance: 20.3 },
        draw: 23.1,
      },
      {
        marketId: "everton-ipswich",
        league: "EPL",
        when: "Sat, Sep 19",
        kickoff: "07:30 PM",
        home: { name: "Everton", crest: crest("EVE", "#003399"), chance: 56.6 },
        away: { name: "Ipswich", crest: crest("IPS", "#0044aa"), chance: 22 },
        draw: 26.1,
      },
    ],
  },
  {
    id: "gdl-open",
    name: "GDL Open",
    count: 6,
    sport: "tennis",
    outrights: [],
    matches: [
      {
        marketId: "frech-dolehide",
        league: "GDL Open",
        when: "Thu, Sep 17",
        kickoff: "12:40 AM",
        home: { name: "M. Frech", crest: crest("MF", "#1d4ed8", { flag: "PL", shape: "circle", image: "/images/markets/tennis-player-a.png" }), chance: 66 },
        away: { name: "C. Dolehide", crest: crest("CD", "#b45309", { flag: "US", shape: "circle", image: "/images/markets/tennis-player-b.png" }), chance: 34 },
      },
      {
        marketId: "stearns-stephens",
        league: "GDL Open",
        when: "Thu, Sep 17",
        kickoff: "11:40 AM",
        home: { name: "P. Stearns", crest: crest("PS", "#1d4ed8", { flag: "US", shape: "circle", image: "/images/markets/tennis-player-c.png" }), chance: 58 },
        away: { name: "S. Stephens", crest: crest("SS", "#b45309", { flag: "US", shape: "circle", image: "/images/markets/tennis-player-d.png" }), chance: 42 },
      },
      {
        marketId: "kostyuk-townsend",
        league: "GDL Open",
        when: "Thu, Sep 17",
        kickoff: "05:30 AM",
        home: { name: "M. Kostyuk", crest: crest("MK", "#0057b7", { flag: "UA", shape: "circle", image: "/images/markets/tennis-player-e.png" }), chance: 61 },
        away: { name: "T. Townsend", crest: crest("TT", "#b45309", { flag: "US", shape: "circle", image: "/images/markets/tennis-player-b.png" }), chance: 39 },
      },
      {
        marketId: "day-samsonova",
        league: "GDL Open",
        when: "Thu, Sep 17",
        kickoff: "11:40 AM",
        home: { name: "K. Day", crest: crest("KD", "#b45309", { flag: "US", shape: "circle", image: "/images/markets/tennis-player-c.png" }), chance: 39 },
        away: { name: "L. Samsonova", crest: crest("LS", "#1f2937", { flag: "RU", shape: "circle", image: "/images/markets/tennis-player-d.png" }), chance: 61 },
      },
    ],
  },
];

export const esportTabs: { id: EsportTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "cs2", label: "CS2" },
  { id: "dota2", label: "Dota 2" },
  { id: "valorant", label: "Valorant" },
  { id: "lol", label: "LoL" },
];

export const esportMatches: EsportMatch[] = [
  {
    marketId: "exrustec-nexus-m1",
    game: "cs2",
    // Sample fixture: no live score feed exists, so never mark it live.
    when: "Wed, Sep 16 · 7:00 PM",
    home: { name: "ex-RUSTEC", crest: crest("XR", "#5b3fd6"), chance: 57 },
    away: { name: "Nexus", crest: crest("NX", "#128a6a"), chance: 43 },
  },
  {
    marketId: "exrustec-nexus-m1",
    game: "cs2",
    when: "Wed, Sep 16 · 10:30 PM",
    home: { name: "ex-RUSTEC", crest: crest("XR", "#5b3fd6"), chance: 42 },
    away: { name: "Nexus", crest: crest("NX", "#128a6a"), chance: 58 },
  },
  {
    marketId: "exrustec-nexus-m2",
    game: "cs2",
    when: "Wed, Sep 16 · 10:30 PM",
    home: { name: "ex-RUSTEC", crest: crest("XR", "#5b3fd6"), chance: 53 },
    away: { name: "Nexus", crest: crest("NX", "#128a6a"), chance: 47 },
  },
  {
    marketId: "b8-metizport",
    game: "cs2",
    when: "Thu, Sep 17",
    kickoff: "01:30 PM",
    home: { name: "B8", crest: crest("B8", "#111111"), chance: 69.6 },
    away: { name: "Metizport", crest: crest("MET", "#2f6fed"), chance: 34.7 },
  },
  {
    marketId: "tope-invictus",
    game: "dota2",
    when: "Thu, Sep 17",
    kickoff: "02:30 PM",
    home: { name: "Top Esports", crest: crest("TES", "#e10600"), chance: 46.8 },
    away: { name: "Invictus Gaming", crest: crest("IG", "#c4a02a"), chance: 57.8 },
  },
  {
    marketId: "gamerlegion-luminosity",
    game: "cs2",
    when: "Thu, Sep 17",
    kickoff: "02:30 PM",
    home: { name: "GamerLegion", crest: crest("GL", "#6b4ea0"), chance: 56.8 },
    away: { name: "Luminosity", crest: crest("LG", "#3aa0d6"), chance: 47.8 },
  },
  {
    marketId: "nip-m80",
    game: "cs2",
    when: "Thu, Sep 17",
    kickoff: "02:30 PM",
    home: { name: "NIP", crest: crest("NIP", "#1a1a1a"), chance: 55.1 },
    away: { name: "M80", crest: crest("M80", "#7cb342"), chance: 51.8 },
  },
  {
    marketId: "mouz-nrg",
    game: "cs2",
    when: "Thu, Sep 17",
    kickoff: "03:30 PM",
    home: { name: "MOUZ", crest: crest("MOZ", "#c62828"), chance: 88.1 },
    away: { name: "NRG", crest: crest("NRG", "#111111"), chance: 15.2 },
  },
];

export const channelMarketFilter: Record<Exclude<FeedChannel, "all">, (market: Market) => boolean> = {
  crypto: (market) => market.category === "finance" || market.tag === "sol" || market.tag === "scq",
  sport: (market) =>
    market.category === "sports" && !["cs2", "dota2"].includes(market.tag),
  esports: (market) => ["cs2", "dota2"].includes(market.tag),
  finance: (market) => market.category === "finance",
  politics: (market) => market.category === "politics",
  entertainment: (market) =>
    market.category === "entertainment" || market.category === "culture" || market.category === "science",
};

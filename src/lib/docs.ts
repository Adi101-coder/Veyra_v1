export type DocsItem = {
  id: string;
  title: string;
};

export type DocsGroup = {
  heading: string;
  items: DocsItem[];
};

export type DocsSection = {
  id: string;
  heading: string;
  paragraphs: string[];
  code?: string;
};

export type DocsArticle = {
  id: string;
  category: string;
  title: string;
  description: string;
  updated: string;
  toc: { id: string; label: string }[];
  sections: DocsSection[];
};

export const docsNav: DocsGroup[] = [
  {
    heading: "Getting Started",
    items: [
      { id: "introduction", title: "Introduction" },
      { id: "what-is-veyra", title: "What is VEYRA?" },
      { id: "quickstart", title: "Quickstart" },
      { id: "create-an-account", title: "Create an account" },
      { id: "connect-a-wallet", title: "Connect a wallet" },
    ],
  },
  {
    heading: "Trading",
    items: [
      { id: "markets", title: "Markets" },
      { id: "positions", title: "Positions" },
      { id: "orders", title: "Orders" },
      { id: "settlement", title: "Settlement" },
      { id: "fees", title: "Fees" },
    ],
  },
  {
    heading: "Developers",
    items: [
      { id: "api-overview", title: "API overview" },
      { id: "rest-api", title: "REST API" },
      { id: "websockets", title: "WebSockets" },
      { id: "sdk", title: "SDK" },
      { id: "webhooks", title: "Webhooks" },
    ],
  },
  {
    heading: "Protocol",
    items: [
      { id: "architecture", title: "Architecture" },
      { id: "smart-contracts", title: "Smart contracts" },
      { id: "oracles", title: "Oracles" },
      { id: "resolution", title: "Resolution" },
      { id: "liquidity", title: "Liquidity" },
    ],
  },
  {
    heading: "Resources",
    items: [
      { id: "faq", title: "FAQ" },
      { id: "security", title: "Security" },
      { id: "changelog", title: "Changelog" },
      { id: "glossary", title: "Glossary" },
    ],
  },
];

export const popularDocs = [
  { id: "introduction", label: "Getting started" },
  { id: "markets", label: "Trading" },
  { id: "api-overview", label: "API" },
  { id: "smart-contracts", label: "Smart contracts" },
] as const;

export const versions = ["v1.0"] as const;

const updated = "12 September 2026";

export const articles: Record<string, DocsArticle> = {
  introduction: {
    id: "introduction",
    category: "Getting Started",
    title: "Introduction",
    description:
      "Understand how VEYRA works and start trading on-chain outcomes in minutes.",
    updated,
    toc: [
      { id: "introduction", label: "Introduction" },
      { id: "markets-reimagined", label: "Markets" },
      { id: "how-it-works", label: "How it works" },
      { id: "trading", label: "Trading" },
      { id: "settlement", label: "Settlement" },
    ],
    sections: [
      {
        id: "markets-reimagined",
        heading: "Markets, reimagined",
        paragraphs: [
          "VEYRA lets you trade positions based on future outcomes — prices, events, and questions the world has not answered yet.",
          "Each market is a clear claim. Participants buy YES or NO. The resulting price is a live signal of collective conviction.",
          "There is no bookie in the middle. Rules are published before the first trade. Settlement follows those rules, on-chain.",
        ],
        code: "npm install @veyra/sdk",
      },
      {
        id: "how-it-works",
        heading: "How it works",
        paragraphs: [],
      },
      {
        id: "trading",
        heading: "Trading",
        paragraphs: [
          "Open a market, size a position, and submit an order. Fills are visible immediately. You can add, reduce, or close exposure until resolution.",
          "Use the dashboard for discretionary flow, or the SDK when you want the same path from code. Both talk to the same matching and settlement layer.",
        ],
      },
      {
        id: "settlement",
        heading: "Settlement",
        paragraphs: [
          "When an outcome is known, the oracle posts resolution. Winning positions settle automatically. Losing positions expire.",
          "You can inspect every step: the published criteria, the oracle report, and the payout transaction. Nothing is moved off-protocol.",
        ],
      },
    ],
  },
  "what-is-veyra": {
    id: "what-is-veyra",
    category: "Getting Started",
    title: "What is VEYRA?",
    description: "A concise map of the protocol, the product, and who it is for.",
    updated,
    toc: [
      { id: "protocol", label: "Protocol" },
      { id: "product", label: "Product" },
      { id: "who", label: "Who it is for" },
    ],
    sections: [
      {
        id: "protocol",
        heading: "A protocol for on-chain outcomes",
        paragraphs: [
          "VEYRA is infrastructure for trading future events. Markets, matching, oracles, and settlement live on-chain.",
          "The product you see in the app is one interface to that infrastructure. Builders can sit on the same rails.",
        ],
      },
      {
        id: "product",
        heading: "The product",
        paragraphs: [
          "Discover live markets, take YES or NO positions, and watch prices move as information arrives.",
          "When the event resolves, settlement is automatic. Your portfolio reflects the outcome without a manual claim flow.",
        ],
      },
      {
        id: "who",
        heading: "Who it is for",
        paragraphs: [
          "Traders who want liquid exposure to real-world questions. Developers wiring VEYRA into products. Researchers who treat prices as forecasts.",
        ],
      },
    ],
  },
  quickstart: {
    id: "quickstart",
    category: "Getting Started",
    title: "Quickstart",
    description: "Go from install to a live market read in a few commands.",
    updated,
    toc: [
      { id: "install", label: "Install" },
      { id: "read", label: "Read a market" },
    ],
    sections: [
      {
        id: "install",
        heading: "Install the SDK",
        paragraphs: [
          "The TypeScript SDK is the fastest way to talk to VEYRA from an app or a script.",
        ],
        code: "npm install @veyra/sdk",
      },
      {
        id: "read",
        heading: "Read a market",
        paragraphs: [
          "Create a client, then fetch a market by id. Prices, liquidity, and resolution criteria arrive in one response.",
        ],
        code: `import { Veyra } from "@veyra/sdk";

const veyra = new Veyra();
const market = await veyra.markets.get("eth-5k");
console.log(market.yes, market.no);`,
      },
    ],
  },
  "create-an-account": {
    id: "create-an-account",
    category: "Getting Started",
    title: "Create an account",
    description: "Accounts on VEYRA are wallets. There is no separate username layer.",
    updated,
    toc: [{ id: "wallet-first", label: "Wallet-first" }],
    sections: [
      {
        id: "wallet-first",
        heading: "Wallet-first accounts",
        paragraphs: [
          "Connecting a wallet is creating an account. Positions, history, and settlement all attach to that address.",
          "You can browse markets without connecting. Trading, portfolio, and API keys require a connected wallet.",
        ],
      },
    ],
  },
  "connect-a-wallet": {
    id: "connect-a-wallet",
    category: "Getting Started",
    title: "Connect a wallet",
    description: "How VEYRA authenticates sessions and signs transactions.",
    updated,
    toc: [{ id: "connect", label: "Connect" }],
    sections: [
      {
        id: "connect",
        heading: "Connect from the app",
        paragraphs: [
          "Use Launch app, then Connect wallet. Supported wallets include Phantom, Solflare, Backpack, and browser wallets on EVM where enabled.",
          "The first signature is a session. Orders and withdrawals require a second confirmation from the wallet.",
        ],
      },
    ],
  },
  markets: {
    id: "markets",
    category: "Trading",
    title: "Markets",
    description: "How a VEYRA market is structured, listed, and discovered.",
    updated,
    toc: [
      { id: "structure", label: "Structure" },
      { id: "discovery", label: "Discovery" },
    ],
    sections: [
      {
        id: "structure",
        heading: "Market structure",
        paragraphs: [
          "Every market has a question, two sides, published resolution criteria, and a close time.",
          "Price is the implied probability of YES. NO is the complement. Both can be traded until the market closes.",
        ],
      },
      {
        id: "discovery",
        heading: "Discovery",
        paragraphs: [
          "Browse from the Markets page, filter by category, or query the API. Featured markets surface high-volume questions.",
        ],
      },
    ],
  },
  positions: {
    id: "positions",
    category: "Trading",
    title: "Positions",
    description: "YES and NO inventory, exposure, and how PnL is shown before settlement.",
    updated,
    toc: [{ id: "inventory", label: "Inventory" }],
    sections: [
      {
        id: "inventory",
        heading: "Inventory",
        paragraphs: [
          "A position is a quantity of YES or NO in a market. Mark-to-market uses the last tradeable price.",
          "You can close a position by trading the opposite side before resolution, or hold through settlement.",
        ],
      },
    ],
  },
  orders: {
    id: "orders",
    category: "Trading",
    title: "Orders",
    description: "Order types, fills, and what happens when liquidity is thin.",
    updated,
    toc: [{ id: "types", label: "Types" }],
    sections: [
      {
        id: "types",
        heading: "Order types",
        paragraphs: [
          "Market orders take available liquidity. Limit orders rest on the book until filled or cancelled.",
          "Partial fills are normal. Unfilled remainder stays open unless you set an immediate-or-cancel flag in the API.",
        ],
      },
    ],
  },
  settlement: {
    id: "settlement",
    category: "Trading",
    title: "Settlement",
    description: "What happens when a market resolves and how payouts are delivered.",
    updated,
    toc: [{ id: "payouts", label: "Payouts" }],
    sections: [
      {
        id: "payouts",
        heading: "Payouts",
        paragraphs: [
          "After resolution, winning shares redeem at 1. Losing shares redeem at 0. Balances update in the portfolio without a claim transaction in the app.",
          "Builders using the contracts directly should follow the settlement interface in Smart contracts.",
        ],
      },
    ],
  },
  fees: {
    id: "fees",
    category: "Trading",
    title: "Fees",
    description: "Trading fees, maker rebates, and what you pay at settlement.",
    updated,
    toc: [{ id: "schedule", label: "Schedule" }],
    sections: [
      {
        id: "schedule",
        heading: "Fee schedule",
        paragraphs: [
          "Taker fee is 1.0%. Maker fee is 0.1% with a rebate on adding liquidity.",
          "There is no separate settlement fee. Protocol revenue is taken from trading fees only.",
        ],
      },
    ],
  },
  "api-overview": {
    id: "api-overview",
    category: "Developers",
    title: "API overview",
    description: "REST, WebSockets, the SDK, and webhooks share one data model.",
    updated,
    toc: [
      { id: "surfaces", label: "Surfaces" },
      { id: "auth", label: "Auth" },
    ],
    sections: [
      {
        id: "surfaces",
        heading: "Surfaces",
        paragraphs: [
          "REST is for reads and order placement. WebSockets stream trades, books, and resolutions. Webhooks push the same events to your backend.",
          "Start with the SDK unless you have a reason to speak HTTP directly.",
        ],
        code: "import { Veyra } from \"@veyra/sdk\";",
      },
      {
        id: "auth",
        heading: "Auth",
        paragraphs: [
          "Public market data needs no key. Trading and account routes require a wallet-signed session or an API key issued from the dashboard.",
        ],
      },
    ],
  },
  "rest-api": {
    id: "rest-api",
    category: "Developers",
    title: "REST API",
    description: "Base URL, versioning, and the core resources.",
    updated,
    toc: [{ id: "base", label: "Base URL" }],
    sections: [
      {
        id: "base",
        heading: "Base URL",
        paragraphs: [
          "All REST routes are versioned. v1 is the current stable surface.",
        ],
        code: "https://api.veyra.markets/v1/markets",
      },
    ],
  },
  websockets: {
    id: "websockets",
    category: "Developers",
    title: "WebSockets",
    description: "Subscribe to trades, order books, and resolution events.",
    updated,
    toc: [{ id: "subscribe", label: "Subscribe" }],
    sections: [
      {
        id: "subscribe",
        heading: "Subscribe",
        paragraphs: [
          "Open a socket, then send a subscribe message with market ids and channels. Heartbeats arrive every 15 seconds.",
        ],
        code: `wss://stream.veyra.markets/v1
{ "op": "subscribe", "markets": ["eth-5k"], "channels": ["trades"] }`,
      },
    ],
  },
  sdk: {
    id: "sdk",
    category: "Developers",
    title: "SDK",
    description: "Typed clients for markets, orders, and account state.",
    updated,
    toc: [{ id: "install", label: "Install" }],
    sections: [
      {
        id: "install",
        heading: "Install",
        paragraphs: [
          "The SDK wraps REST and WebSockets. It is the recommended integration path for TypeScript apps.",
        ],
        code: "npm install @veyra/sdk",
      },
    ],
  },
  webhooks: {
    id: "webhooks",
    category: "Developers",
    title: "Webhooks",
    description: "Receive fills, resolutions, and market listings on your server.",
    updated,
    toc: [{ id: "endpoints", label: "Endpoints" }],
    sections: [
      {
        id: "endpoints",
        heading: "Endpoints",
        paragraphs: [
          "Register an HTTPS endpoint in the dashboard. Events are signed. Reject payloads that fail signature checks.",
        ],
      },
    ],
  },
  architecture: {
    id: "architecture",
    category: "Protocol",
    title: "Architecture",
    description: "How matching, oracles, and settlement sit together.",
    updated,
    toc: [{ id: "layers", label: "Layers" }],
    sections: [
      {
        id: "layers",
        heading: "Layers",
        paragraphs: [
          "The trading layer matches orders and publishes books. The oracle layer posts resolution. The settlement layer transfers value.",
          "Each layer is independently inspectable. A failure in matching cannot rewrite a published resolution.",
        ],
      },
    ],
  },
  "smart-contracts": {
    id: "smart-contracts",
    category: "Protocol",
    title: "Smart contracts",
    description: "Core contracts, addresses, and how to verify them.",
    updated,
    toc: [{ id: "core", label: "Core" }],
    sections: [
      {
        id: "core",
        heading: "Core contracts",
        paragraphs: [
          "Market factory, position vault, and settlement module are the contracts you will integrate against.",
          "Addresses for v1.0 are listed in the changelog. Always verify the source against the published hashes.",
        ],
      },
    ],
  },
  oracles: {
    id: "oracles",
    category: "Protocol",
    title: "Oracles",
    description: "How VEYRA observes the real world without trusting a single feed.",
    updated,
    toc: [{ id: "reports", label: "Reports" }],
    sections: [
      {
        id: "reports",
        heading: "Reports",
        paragraphs: [
          "Each market names its resolution source at listing. The oracle posts a signed report when the outcome is known.",
          "Disputed reports enter a challenge window before settlement is final.",
        ],
      },
    ],
  },
  resolution: {
    id: "resolution",
    category: "Protocol",
    title: "Resolution",
    description: "From oracle report to final payout.",
    updated,
    toc: [{ id: "finality", label: "Finality" }],
    sections: [
      {
        id: "finality",
        heading: "Finality",
        paragraphs: [
          "Resolution is final after the challenge window. Payouts cannot be reversed by the app or the team.",
          "If criteria were ambiguous, the market is voided and collateral is returned.",
        ],
      },
    ],
  },
  liquidity: {
    id: "liquidity",
    category: "Protocol",
    title: "Liquidity",
    description: "How books stay tradeable and what incentives exist for makers.",
    updated,
    toc: [{ id: "makers", label: "Makers" }],
    sections: [
      {
        id: "makers",
        heading: "Makers",
        paragraphs: [
          "Makers quote both sides and earn a rebate. Some markets include a protocol-owned liquidity bootstrapping period.",
          "There is no hidden market maker with privileged flow. The book is the book.",
        ],
      },
    ],
  },
  faq: {
    id: "faq",
    category: "Resources",
    title: "FAQ",
    description: "Short answers to the questions we hear first.",
    updated,
    toc: [{ id: "basics", label: "Basics" }],
    sections: [
      {
        id: "basics",
        heading: "Basics",
        paragraphs: [
          "VEYRA is a protocol, not a bookmaker. You trade against other participants.",
          "Outcomes follow the criteria published at listing. If you need the long form, start with Introduction and Security.",
        ],
      },
    ],
  },
  security: {
    id: "security",
    category: "Resources",
    title: "Security",
    description: "Audits, keys, and how we think about risk.",
    updated,
    toc: [{ id: "posture", label: "Posture" }],
    sections: [
      {
        id: "posture",
        heading: "Posture",
        paragraphs: [
          "Contracts are audited before each upgrade. API keys can be scoped and revoked from the dashboard.",
          "Never share a seed phrase with VEYRA. We will never ask for one.",
        ],
      },
    ],
  },
  changelog: {
    id: "changelog",
    category: "Resources",
    title: "Changelog",
    description: "What shipped in v1.0 and how we version the protocol.",
    updated,
    toc: [{ id: "v1", label: "v1.0" }],
    sections: [
      {
        id: "v1",
        heading: "v1.0",
        paragraphs: [
          "Initial mainnet: markets, orders, settlement, REST, WebSockets, and the TypeScript SDK.",
          "Future versions will be listed here with contract hashes and migration notes.",
        ],
      },
    ],
  },
  glossary: {
    id: "glossary",
    category: "Resources",
    title: "Glossary",
    description: "Terms used across the product and the protocol docs.",
    updated,
    toc: [{ id: "terms", label: "Terms" }],
    sections: [
      {
        id: "terms",
        heading: "Terms",
        paragraphs: [
          "YES / NO — the two sides of a market. Position — inventory of one side. Resolution — the oracle’s posted outcome. Settlement — the transfer that follows.",
          "Implied probability — the last YES price, expressed as a percent.",
        ],
      },
    ],
  },
};

export function flattenDocs() {
  return docsNav.flatMap((group) =>
    group.items.map((item) => ({ ...item, category: group.heading })),
  );
}

export function getArticle(id: string) {
  const mapped = id === "what-is-nova" ? "what-is-veyra" : id;
  return articles[mapped] ?? articles.introduction;
}

export function neighbors(id: string) {
  const list = flattenDocs();
  const index = list.findIndex((item) => item.id === id);
  return {
    prev: index > 0 ? list[index - 1] : null,
    next: index >= 0 && index < list.length - 1 ? list[index + 1] : null,
  };
}

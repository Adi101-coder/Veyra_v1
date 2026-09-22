export type FaqItem = {
  q: string;
  a: string;
  link?: {
    href: string;
    label: string;
  };
};

export const siteConfig = {
  name: "Split",
  wordmark: "Split",
  title: "Split — Trade the future, Split with conviction.",
  description:
    "Express your confidence in outcomes as percentages. Split turns that probability into an order, then scores how accurate the forecast was.",
  tagline: "On-chain markets for the future.",
  nav: [
    { href: "/", label: "Home" },
    { href: "/docs", label: "How it works" },
  ],
  cta: "Take a position",
  ctaHref: "/dashboard",
  x: {
    handle: "@Splitahead",
    href: "https://x.com/Splitahead",
  },
  hero: {
    kicker: "Prediction markets",
    status: "Updated live",
    headline: "Where conviction meets capital.",
    subhead:
      "A transparent platform where participants express conviction with capital and earn rewards for being right.",
    body: "Back your predictions on the events that matter. Markets, sports, technology, politics, culture—if the future is uncertain, there's a position to take.",
    lede: "The future isn't guessed. It's priced. Every position reflects collective conviction, creating live signals around tomorrow's outcomes.",
  },
  stats: [
    { value: "2,847", label: "Active Markets" },
    { value: "31,000+", label: "Participants" },
    { value: "$12.4M", label: "Volume Settled" },
    { value: "Live", label: "Updated Live", pulse: true },
  ],
  how: {
    kicker: "How it works",
    title: "Four rules from market to settlement.",
    itemLabel: "Rule",
  },
  rules: [
    {
      n: "I",
      icon: "/images/rule-market.png",
      alt: "Open market ledger",
      title: "Create a Market",
      body: "Will a startup raise funding? Will a team win the championship? Will Bitcoin close above a certain price? Any future event can become a market.",
    },
    {
      n: "II",
      icon: "/images/rule-position.png",
      alt: "A stake being placed",
      title: "Take a Position",
      body: "Participants stake according to their belief. Stronger conviction means greater exposure.",
    },
    {
      n: "III",
      icon: "/images/rule-discovery.png",
      alt: "Odds moving with the crowd",
      title: "Collective Price Discovery",
      body: "As more positions are placed, market odds evolve. Every participant contributes information to the final signal.",
    },
    {
      n: "IV",
      icon: "/images/rule-settle.png",
      alt: "Settlement and rewards",
      title: "Resolution & Rewards",
      body: "When the outcome becomes known, rewards are distributed according to accuracy and participation. The market settles itself.",
    },
  ],
  faqTitle: "Questions",
  faq: [
    {
      q: "What is Split?",
      a: "Split is a prediction protocol where you express confidence as a percentage. That probability becomes the order, and settlement scores how accurate it was.",
    },
    {
      q: "How are outcomes determined?",
      a: "Each market contains predefined resolution criteria and settlement rules established before participation begins.",
    },
    {
      q: "Who is it for?",
      a: "Traders, analysts, sports fans, researchers, and anyone with a strong view about the future.",
    },
    {
      q: "What can I predict?",
      a: "Markets, sports, technology, politics, entertainment, business events, and more.",
    },
    {
      q: "Why participate?",
      a: "Because information has value, and accurate predictions deserve rewards.",
    },
    {
      q: "How is conviction scored?",
      a: "Stake and stated probability map onto risk. The explainer shows how certainty, the other seat, and settlement interact.",
      link: { href: "/how-it-works", label: "Read How it works" },
    },
  ],
  socialPage: {
    kicker: "Community",
    title: "Where the sharpest predictions gather.",
    sectionKicker: "The floor",
    sectionTitle: "Analysts, bettors, traders.",
    sectionBody:
      "A community of analysts, bettors, traders, forecasters, and curious minds testing their understanding of the future.",
    footnoteKicker: "Channels",
    footnote:
      "Follow @Splitahead on X for market notes and product updates. Discord and Telegram open with the public floor.",
  },
  channels: [
    { label: "X", handle: "@Splitahead", href: "https://x.com/Splitahead" },
    { label: "Discord", handle: "Opening soon", href: "#discord" },
    { label: "Telegram", handle: "Opening soon", href: "#telegram" },
  ],
  docs: {
    kicker: "Documentation",
    title: "How Split Works",
    body: "A market is a question about the future. Positions price that question. Settlement pays the people who were right.",
    steps: [
      {
        n: "01",
        title: "Create a Market",
        body: "Frame a future event as a clear question with predefined resolution criteria.",
      },
      {
        n: "02",
        title: "Publish the Rules",
        body: "Settlement terms are locked before anyone can take a position. No moving the goalposts.",
      },
      {
        n: "03",
        title: "Take a Position",
        body: "Stake capital according to your belief. Stronger conviction means greater exposure.",
      },
      {
        n: "04",
        title: "Watch Price Discovery",
        body: "As more positions land, odds move. The market becomes a live signal of collective conviction.",
      },
      {
        n: "05",
        title: "Resolve the Outcome",
        body: "When the event happens, the market resolves against the criteria that were published at open.",
      },
      {
        n: "06",
        title: "Distribute Rewards",
        body: "Payouts follow accuracy and participation. The market settles itself.",
      },
    ],
  },
  notFound: {
    title: "Market not found.",
    body: "That contract never opened. Step back to the floor and pick a live market.",
    cta: "Return to Split",
  },
  footer: [
    {
      heading: "Product",
      links: [
        { label: "About", href: "/how-it-works" },
        { label: "Dashboard", href: "/dashboard" },
        { label: "Markets", href: "/markets" },
      ],
    },
    {
      heading: "Channels",
      links: [
        { label: "X", href: "https://x.com/Splitahead" },
        { label: "Discord", href: "#discord" },
        { label: "Telegram", href: "#telegram" },
      ],
    },
    {
      heading: "Resources",
      links: [
        { label: "Docs", href: "/docs" },
        { label: "Whitepaper", href: "#whitepaper" },
        { label: "Questions", href: "/#faq" },
      ],
    },
  ],
} as const;

export function mastheadDate(now = new Date()) {
  return now
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();
}

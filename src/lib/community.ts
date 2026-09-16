export const communityStats = [
  { value: 12, decimals: 0, suffix: "K+", label: "Community members" },
  { value: 4.8, decimals: 1, suffix: "K", label: "Discord members" },
  { value: 2.1, decimals: 1, suffix: "K", label: "Builders" },
  { value: 85, decimals: 0, suffix: "K+", label: "Monthly interactions" },
] as const;

export const communityChannels = [
  {
    id: "discord",
    name: "Discord",
    description: "Talk markets, strategies, ideas, and everything VEYRA.",
    members: "4.8K members",
    href: "#discord",
    cta: "Join Discord",
  },
  {
    id: "x",
    name: "X / Twitter",
    description: "Follow market updates, announcements, and community conversations.",
    members: "12K followers",
    href: "#x",
    cta: "Follow on X",
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Stay connected with the VEYRA community wherever you are.",
    members: "6.2K members",
    href: "#telegram",
    cta: "Join Telegram",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Explore the code, contribute, and build with the protocol.",
    members: "1.1K stars",
    href: "#github",
    cta: "View GitHub",
  },
] as const;

export const communityActivity = [
  {
    kind: "New market created",
    title: "ETH above $5,000",
    body: "A new market is live on whether Ethereum prints five thousand before year end.",
    time: "2m ago",
  },
  {
    kind: "Community discussion",
    title: "Will prediction markets become mainstream?",
    body: "Traders and researchers are debating distribution, regulation, and liquidity.",
    time: "14m ago",
  },
  {
    kind: "Protocol update",
    title: "VEYRA v1.2 is now live",
    body: "Matching latency is down and settlement receipts are easier to verify.",
    time: "1h ago",
  },
  {
    kind: "Developer activity",
    title: "New SDK integration published",
    body: "A typed client example for reading books and posting orders is in the docs.",
    time: "3h ago",
  },
] as const;

export const communityPeople = [
  { initials: "AM", label: "A.M." },
  { initials: "KR", label: "K.R." },
  { initials: "NL", label: "N.L." },
  { initials: "VS", label: "V.S." },
  { initials: "JT", label: "J.T." },
] as const;

export const communityEvents = [
  {
    n: "01",
    title: "Weekly Market Talk",
    cadence: "Every Thursday",
    body: "Join traders discussing the biggest markets of the week.",
  },
  {
    n: "02",
    title: "Builder Sessions",
    cadence: "Monthly",
    body: "Build, experiment, and ship with VEYRA.",
  },
  {
    n: "03",
    title: "Community AMA",
    cadence: "Coming soon",
    body: "Ask questions directly to the VEYRA team.",
  },
] as const;

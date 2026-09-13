export const siteConfig = {
  name: "riverboat",
  title: "Riverboat",
  description:
    "A composable, on-chain truth machine, where honesty is the only winning strategy. Decentralized, permissionless, and liquid.",
  epoch: "2026-06-21",
  contractCount: 43,
  appUrl: "https://app.riverboat.zone/",
  social: {
    twitter: "https://x.com/riverboat_x",
    twitterHandle: "@riverboat_x",
    discord: "https://discord.gg/TaCNnJrzz9",
    discordHandle: "discord.gg/riverboat",
    telegram: "https://t.me/+FjU-CM3_xF02Zjk5",
    telegramHandle: "t.me/riverboat",
    pumpfun:
      "https://pump.fun/coin/4t1xhKJd6oFGr98oWJoxYjLU74eFe7xiYSRDoX18pump",
    mint: "4t1xhKJd6oFGr98oWJoxYjLU74eFe7xiYSRDoX18pump",
  },
  audit:
    "https://github.com/SlotZeroSecurity/audits/blob/main/Riverboat-Security-Review-Mainnet-Alpha-v1.0.pdf",
  nav: [
    { href: "/#faq", label: "FAQ" },
    { href: "/docs", label: "Documentation" },
    { href: "/social", label: "Social" },
  ],
  partners: [
    {
      name: "Breakout",
      href: "https://blog.colosseum.com/announcing-the-winners-of-the-solana-breakout-hackathon/",
    },
    { name: "Helius", href: "https://www.helius.dev/" },
    { name: "Solana", href: "https://solana.com/" },
  ],
  rules: [
    {
      n: "I",
      icon: "/images/rule-feather.png",
      alt: "Quill and inkwell",
      title: "Write a contract about anything.",
      body: "Will _____ before October? Will _______? Any future-tense statement, in plain prose.",
    },
    {
      n: "II",
      icon: "/images/rule-balance.png",
      alt: "Balance scale",
      title: "Players submit confidence percentages.",
      body: "Not yes or no. A number between zero and one hundred — your honest belief that the statement will resolve true, and a stake in SOL behind it.",
    },
    {
      n: "III",
      icon: "/images/rule-sun.png",
      alt: "Sun face emblem",
      title: "The algorithm scores predictions against each other.",
      body: "A logarithmic scoring rule rewards calibration: the better your confidence matches the outcome, the greater your reward. Overconfidence is penalized; accuracy pays.",
    },
    {
      n: "IV",
      icon: "/images/rule-hands.png",
      alt: "Clasped hands",
      title: "Escrow releases to honest predictors.",
      body: "When the Wager resolves, the on-chain program pays each participant in proportion to their proper score. No moderator; no winner-takes-all. The math is the judge.",
    },
  ],
  faq: [
    {
      q: "What is Riverboat?",
      a: "Riverboat is a decentralized prediction protocol built on Solana. Instead of relying on order books, market makers, or intermediaries, Riverboat lets participants stake their confidence on future outcomes directly on-chain and settle with any Solana address. Anyone can use or build on it, without permission. Payouts are calibrated to conviction—the more accurate your confidence, the better your reward.",
    },
    {
      q: "How does it work?",
      a: "Riverboat runs entirely across two Solana programs. Every interaction creates or mutates an on-chain account: a Contract defines the market, Terms can be attached to describe the rules, anyone can make a Wager against that Contract, and participants take a Seat to join. Once a Wager fills to capacity and resolves, payouts are calculated automatically based on how well each participant's confidence matched the outcome.",
    },
    {
      q: "Why Solana?",
      a: "Speed, cost, and composability. Riverboat's model sidesteps the need for order books and market makers — but it does require every Stake, Seat, and Resolution to settle on-chain. Solana makes that practical: transactions are fast and fees are negligible, on infrastructure that anyone can build on.",
    },
    {
      q: "Who is it for?",
      a: "Riverboat is for anyone sees 'prediction' as more than a YES/NO binary: experts with something to say; rationalist outliers; people making high-context calls in domains like business, science, or journalism; builders and developers interested in new types of markets and resolution infrastructure. Welcome aboard!",
    },
    {
      q: "When does it launch?",
      a: "Our Mainnet Alpha MVP was launched on June 21st, 2026 after the completion of our second third-party security audit, and can be safely used by anyone with a Solana wallet. Onward to Mainnet Beta! Follow along on X or Discord for the next boarding call.",
    },
  ],
  footer: [
    {
      heading: "// About Riverboat",
      links: [
        { label: "About", href: "#about" },
        { label: "Team", href: "#team" },
        { label: "Partner", href: "#partner" },
      ],
    },
    {
      heading: "// Socials",
      links: [
        { label: "Twitter", href: "https://x.com/riverboat_x", external: true },
        {
          label: "Pumpfun",
          href: "https://pump.fun/coin/4t1xhKJd6oFGr98oWJoxYjLU74eFe7xiYSRDoX18pump",
          external: true,
        },
        {
          label: "Telegram",
          href: "https://t.me/+FjU-CM3_xF02Zjk5",
          external: true,
        },
        {
          label: "Discord",
          href: "https://discord.gg/TaCNnJrzz9",
          external: true,
        },
      ],
    },
    {
      heading: "// Resources",
      links: [
        { label: "Docs", href: "/docs" },
        { label: "Whitepaper", href: "#whitepaper" },
        { label: "FAQ", href: "/#faq" },
      ],
    },
  ],
} as const;

export function issueNumber(now = new Date()) {
  const epoch = new Date(`${siteConfig.epoch}T00:00:00`);
  const ms = now.getTime() - epoch.getTime();
  return Math.max(1, Math.floor(ms / 86_400_000));
}

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

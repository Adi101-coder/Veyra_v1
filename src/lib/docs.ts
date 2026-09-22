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
  /** Label for the code block. Defaults to "ts" for code, "math" otherwise. */
  lang?: string;
};

/**
 * Whether the component an article describes exists today.
 * - live: shipped and covered by the test suite
 * - in-progress: partially built, or built but switched off
 * - planned: target architecture, not built
 */
export type DocsStatus = "live" | "in-progress" | "planned";

export type DocsArticle = {
  id: string;
  category: string;
  title: string;
  description: string;
  updated: string;
  status: DocsStatus;
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
      { id: "connect-a-wallet", title: "Connect a wallet" },
    ],
  },
  {
    heading: "Mechanism",
    items: [
      { id: "confidence-model", title: "Confidence & Kelly sizing" },
      { id: "execution-engine", title: "Execution engine" },
      { id: "change-your-mind", title: "Change Your Mind" },
      { id: "lmsr-pools", title: "LMSR pools" },
      { id: "liquidity-fund", title: "Liquidity fund" },
    ],
  },
  {
    heading: "Scoring",
    items: [
      { id: "reputation", title: "Brier & calibration" },
      { id: "conviction", title: "Conviction" },
    ],
  },
  {
    heading: "Ledger",
    items: [
      { id: "fill-ledger", title: "Fill-driven ledger" },
      { id: "precision", title: "Money precision" },
      { id: "concurrency", title: "Concurrency & idempotency" },
    ],
  },
  {
    heading: "Custody",
    items: [
      { id: "custody", title: "Two-wallet custody" },
      { id: "deposits", title: "Deposits & reorgs" },
      { id: "solvency", title: "Solvency invariant" },
    ],
  },
  {
    heading: "Governance",
    items: [{ id: "daily-voting", title: "Daily voting" }],
  },
  {
    heading: "Protocol",
    items: [
      { id: "architecture", title: "Architecture" },
      { id: "onchain-matching", title: "On-chain matching" },
      { id: "smart-contracts", title: "Smart contracts" },
      { id: "oracles", title: "Oracles" },
      { id: "settlement", title: "Settlement" },
    ],
  },
  {
    heading: "Developers",
    items: [
      { id: "api-overview", title: "API overview" },
      { id: "rest-api", title: "REST API" },
      { id: "streams", title: "Streams" },
    ],
  },
  {
    heading: "Resources",
    items: [
      { id: "security", title: "Security model" },
      { id: "glossary", title: "Glossary" },
      { id: "changelog", title: "Changelog" },
    ],
  },
];

export const popularDocs = [
  { id: "confidence-model", label: "Kelly sizing" },
  { id: "lmsr-pools", label: "LMSR pools" },
  { id: "solvency", label: "Solvency invariant" },
  { id: "onchain-matching", label: "On-chain matching" },
] as const;

export const versions = ["v1.0"] as const;

const updated = "22 September 2026";

/** Builds an article, deriving the table of contents from its sections. */
function article(
  id: string,
  category: string,
  title: string,
  description: string,
  status: DocsStatus,
  sections: DocsSection[],
): DocsArticle {
  return {
    id,
    category,
    title,
    description,
    updated,
    status,
    toc: sections.map((section) => ({ id: section.id, label: section.heading })),
    sections,
  };
}

export const articles: Record<string, DocsArticle> = {
  // ---------------------------------------------------------------- Getting Started
  introduction: article(
    "introduction",
    "Getting Started",
    "Introduction",
    "A confidence-denominated prediction market. You state a probability; the engine prices it against a live book and sizes the position.",
    "live",
    [
      {
        id: "markets-reimagined",
        heading: "Probability is the order",
        paragraphs: [
          "Every other venue asks how many shares you want. VEYRA asks how likely you think the outcome is. That single number is the order: the engine reads the live book, measures your edge against it, and sizes the position with fractional Kelly.",
          "Positions route to Polymarket's CLOB for liquidity. Resolution, scoring and custody are VEYRA's own. Your forecasting record becomes a Brier-scored reputation, and the capital-weighted beliefs of every trader become a Conviction signal the venue itself cannot see.",
          "The status badge on each page is literal. Live components ship with the test suite behind them. Planned components are target architecture, documented in full so the design can be reviewed before it is built.",
        ],
        code: "stake = bankroll × clamp( f × (p − q) / (1 − q), 0, kellyCap )",
        lang: "math",
      },
      { id: "how-it-works", heading: "How it works", paragraphs: [] },
      {
        id: "trading",
        heading: "Trading",
        paragraphs: [
          "You submit (market, outcome, confidence, max stake). The engine quotes against a fresh order book snapshot, rejects stale or wide books, walks the ladder to price the fill, and only then commits. A quote with no edge is not an error — it is the engine declining a trade you should not make.",
          "Execution is asynchronous. An accepted order is not a filled one: positions move only when the venue reports a fill, never from what was requested.",
        ],
      },
      {
        id: "settlement",
        heading: "Settlement",
        paragraphs: [
          "Polymarket-backed markets settle from the venue's resolution. VEYRA-native pools are resolved by an operator behind a dispute window, then paid from the scored result. Every resolved position emits a settlement reference to Robinhood Chain.",
        ],
      },
    ],
  ),

  "what-is-veyra": article(
    "what-is-veyra",
    "Getting Started",
    "What is VEYRA?",
    "Three layers: a confidence engine on top of external liquidity, a native AMM for community markets, and a custody ledger underneath both.",
    "live",
    [
      {
        id: "layers",
        heading: "The stack",
        paragraphs: [
          "Engine — converts a stated probability into a sized, priced order against a live book (Kelly sizing, ladder walking, slippage and spread guards).",
          "Venues — Polymarket's CLOB for external markets; an LMSR market maker for VEYRA-native pools opened by daily voting.",
          "Ledger — an append-only, integer-precision record of every fill, hold, payout and fee, with a solvency invariant checked against chain state.",
        ],
      },
      {
        id: "why",
        heading: "Why confidence, not shares",
        paragraphs: [
          "Share-denominated markets conflate two decisions: what you believe and how much you bet. Kelly separates them — belief is an input, size is an output. Stating 70% on a market trading at 55% is a precise claim of 15 points of edge; the engine does the sizing arithmetic a disciplined trader would.",
          "It also makes belief measurable. A market price is the equilibrium of everyone's size; a confidence is one person's forecast. Scoring forecasts is what makes reputation and Conviction possible.",
        ],
      },
    ],
  ),

  quickstart: article(
    "quickstart",
    "Getting Started",
    "Quickstart",
    "From wallet to first position in four calls.",
    "live",
    [
      {
        id: "flow",
        heading: "The flow",
        paragraphs: [
          "Sign in with a wallet signature (no gas), request a quote, place with an idempotency key, then poll until the venue reports the fill.",
        ],
        code: `import { quotePrediction, placePrediction, getPrediction } from "@/lib/betting-api";

const quote = await quotePrediction({ marketId, outcome: "YES", confidencePct: 72, stakeUsd: "50.00" });
if (!quote.accepted) return; // no edge: the engine declined

const key = crypto.randomUUID(); // reuse on retry — never a second order
const placed = await placePrediction({ marketId, outcome: "YES", confidencePct: 72, stakeUsd: "50.00" }, key);

// 201 means accepted, not filled. Poll the execution.
const live = await getPrediction(placed.id);
live.execution?.status; // created -> submitted -> filled | partial | failed`,
        lang: "ts",
      },
    ],
  ),

  "connect-a-wallet": article(
    "connect-a-wallet",
    "Getting Started",
    "Connect a wallet",
    "Sign-in is a single signature over a one-time nonce. No password, no gas, no custody of your keys.",
    "live",
    [
      {
        id: "handshake",
        heading: "The handshake",
        paragraphs: [
          "The server issues a single-use nonce with a short TTL and the exact message to sign. You sign it; the server verifies the signature against your address and consumes the nonce atomically, so a captured signature cannot be replayed.",
          "The result is an HMAC-signed, HttpOnly session cookie. Mutating requests are same-origin checked. EVM and Solana signatures are both supported.",
        ],
        code: `POST /api/auth/nonce   { walletAddress }            -> { nonce, message }
sign(message)                                         -> signature
POST /api/auth/verify  { walletAddress, nonce, signature } -> Set-Cookie (HttpOnly)`,
        lang: "http",
      },
    ],
  ),

  // ---------------------------------------------------------------------- Mechanism
  "confidence-model": article(
    "confidence-model",
    "Mechanism",
    "Confidence & Kelly sizing",
    "Your stated probability p against the market price q defines edge. Fractional Kelly turns edge into size.",
    "live",
    [
      {
        id: "kelly",
        heading: "The Kelly fraction",
        paragraphs: [
          "A binary contract costs q and pays 1. If your true probability is p, the growth-optimal fraction of bankroll to stake is the full Kelly fraction f* = (p − q) / (1 − q). It is zero when you have no edge (p ≤ q) and approaches one as q approaches zero with p above it.",
          "Full Kelly is famously volatile — it maximises long-run growth but tolerates drawdowns most people would not. VEYRA stakes a fraction of it, then caps the result.",
        ],
        code: `// src/server/confidence/formula.ts  (all values in basis points)
export function rawKellyBps(confidenceBps: number, marketPriceBps: number) {
  const edge = confidenceBps - marketPriceBps;
  const remainder = 10_000 - marketPriceBps;
  if (remainder <= 0 || edge <= 0) return 0;
  return Math.floor((edge * 10_000) / remainder);
}

sized = clamp( rawKelly × VEYRA_KELLY_FRACTION_BPS / 10_000, 0, VEYRA_MAX_KELLY_BPS )
notional = stake × sized / 10_000`,
        lang: "ts",
      },
      {
        id: "edge-floor",
        heading: "The edge floor",
        paragraphs: [
          "A trade must clear VEYRA_MIN_EDGE_BPS after fees and expected slippage, not before. An edge smaller than the cost of crossing the spread is negative expectancy dressed as conviction, and the engine refuses it.",
          "This is why a quote can come back accepted: false. The engine is not failing; it is declining a bet with no mathematical case.",
        ],
      },
      {
        id: "why-fractional",
        heading: "Why fractional",
        paragraphs: [
          "Kelly assumes your p is correct. It never is exactly. Overestimating edge under full Kelly over-bets, and over-betting is the one error Kelly cannot recover from: growth rate goes negative past twice the optimal fraction. A fraction below one trades a little growth for a large reduction in the cost of being wrong about p.",
        ],
      },
    ],
  ),

  "execution-engine": article(
    "execution-engine",
    "Mechanism",
    "Execution engine",
    "How a sized order becomes venue fills: book snapshot, guard rails, ladder walk, order type, reconciliation.",
    "live",
    [
      {
        id: "guards",
        heading: "Guard rails",
        paragraphs: [
          "Before pricing, the book is rejected if it is older than VEYRA_EXECUTION_MAX_BOOK_AGE_MS, if the spread exceeds VEYRA_EXECUTION_MAX_SPREAD_BPS, or if walking it would slip past VEYRA_MAX_SLIPPAGE_BPS. A stale quote is not requeued — it fails, because executing later would fill at a price you never saw.",
        ],
      },
      {
        id: "ladder",
        heading: "Walking the ladder",
        paragraphs: [
          "Size is filled level by level from the best price outward, stopping at your limit. The average price is the notional-weighted mean of the levels consumed, so a large order honestly shows the worse price it will get.",
          "Orders are split into slices no larger than VEYRA_EXECUTION_MAX_SLICE_SHARES and paced to respect venue rate limits.",
        ],
      },
      {
        id: "order-types",
        heading: "Order types",
        paragraphs: [
          "FAK (fill-and-kill) takes whatever is available at or better than the limit and cancels the rest. FOK (fill-or-kill) is all or nothing. GTC rests on the book. FAK and FOK are market orders and take a different SDK entry point from GTC — and a market BUY is denominated in USDC while a market SELL is denominated in shares. Routing a market order through the limit path silently sends the wrong payload.",
        ],
        code: `request.orderType === "GTC"
  ? client.createAndPostOrder({ tokenID, price, size, side }, opts, OrderType.GTC)
  : client.createAndPostMarketOrder(
      { tokenID, price, amount: side === SELL ? shares : usdc, side, orderType },
      opts, orderType)`,
        lang: "ts",
      },
      {
        id: "reconciliation",
        heading: "Reconciliation",
        paragraphs: [
          "A resting or delayed order is recorded as open, never as failed. A reconciler re-reads the venue order and trade list and records fills exactly once per venue trade id. Retries happen only for venue refusals (429/425/503) — never blindly, because a retry after an unseen fill is a duplicate order.",
        ],
      },
    ],
  ),

  "change-your-mind": article(
    "change-your-mind",
    "Mechanism",
    "Change Your Mind",
    "Revise your confidence. Only the share delta trades, and the history is permanent.",
    "live",
    [
      {
        id: "delta",
        heading: "Delta execution",
        paragraphs: [
          "Moving from 80% to 60% recomputes the target position at the new confidence and trades only the difference: a SELL of the excess shares, not a close-and-reopen. Moving up buys the difference and takes a fresh funds reservation for it.",
          "The history row starts pending and becomes applied only when the delta fill is reconciled. Your displayed confidence never runs ahead of your actual inventory.",
        ],
        code: `Δshares = target(confidence_new) − held
Δshares > 0  → BUY  Δshares   (new hold)
Δshares < 0  → SELL |Δshares| (SELL_CREDIT on fill)
Δshares = 0  → no-op`,
        lang: "math",
      },
      {
        id: "locking",
        heading: "One adjustment at a time",
        paragraphs: [
          "A position takes an adjustment lock before computing the delta, so rapid 80 → 60 → 40 changes serialise instead of racing each other against the same inventory. A lock abandoned by a crashed worker expires and is recovered.",
        ],
      },
    ],
  ),

  "lmsr-pools": article(
    "lmsr-pools",
    "Mechanism",
    "LMSR pools",
    "Community markets priced by Hanson's logarithmic market scoring rule, with a worst-case loss known before the first trade.",
    "live",
    [
      {
        id: "cost",
        heading: "The cost function",
        paragraphs: [
          "A pool holds outstanding shares q_YES and q_NO and a liquidity parameter b. Its cost function is C(q) = b · ln(e^(q_YES / b) + e^(q_NO / b)). Buying Δ shares of an outcome costs C(q + Δ) − C(q). The marginal price of YES is the softmax e^(q_YES/b) / (e^(q_YES/b) + e^(q_NO/b)), so the two prices always sum to one.",
          "Evaluated with the log-sum-exp trick to stay finite for large q/b: C(q) = m + b · ln(e^((q_YES − m)/b) + e^((q_NO − m)/b)) with m = max(q_YES, q_NO).",
        ],
        code: `// src/server/pools/lmsr.ts
C(q)      = b · ln( e^(qYes/b) + e^(qNo/b) )
price_YES = 1 / (1 + e^((qNo − qYes)/b))
cost(Δ)   = C(q + Δ) − C(q)            // rounded UP  — toward the pool
proceeds  = C(q) − C(q − Δ)            // rounded DOWN — toward the pool`,
        lang: "math",
      },
      {
        id: "bounded-loss",
        heading: "Bounded loss",
        paragraphs: [
          "The market maker's worst case over any sequence of trades is C at the final state minus C at the start, minus what it collected — which for a binary market is bounded by b · ln(2). This is why LMSR, not a constant-product curve: the maximum a pool can lose is a number known when the pool opens, and that is exactly what the liquidity fund reserves.",
        ],
        code: `maxLoss(b) = b · ln 2          // reserved from the fund at open
b(budget)  = budget / ln 2      // inverse: size the pool to its budget`,
        lang: "math",
      },
      {
        id: "integral-ladder",
        heading: "The integral ladder",
        paragraphs: [
          "The pool quotes through the same order-book interface as an external venue, so the engine and ledger need no special case. Each ladder level is priced at the marginal cost after every preceding lot is absorbed — the integral of the curve, not a flat quote at today's price.",
          "Pricing every level at the current price would let a trader walk the book for less than C(q′) − C(q), and b · ln 2 would stop bounding anything. Walking the ladder reproduces the true integral, and rounding every level up keeps the discretised cost at or above it. A property test runs random buy/sell sequences and asserts the pool's payout never exceeds what it collected plus b · ln 2.",
        ],
      },
      {
        id: "float-boundary",
        heading: "The single float boundary",
        paragraphs: [
          "Money everywhere else is integer. LMSR needs exp and ln, so it cannot be. lmsr.ts is the one place floats exist: every exported function takes and returns integers, and nothing downstream recomputes a cost in floating point. Quote time and execution time therefore cannot disagree by a micro.",
        ],
      },
    ],
  ),

  "liquidity-fund": article(
    "liquidity-fund",
    "Mechanism",
    "Liquidity fund",
    "Fees in, bounded reservations out, and the unallocated remainder is the reserve.",
    "live",
    [
      {
        id: "flow",
        heading: "Flow of funds",
        paragraphs: [
          "Every pool reserves its worst-case loss, b · ln 2, from the fund when it opens. At settlement the reservation is released and the pool's realised result is booked: the pool is the sole counterparty to every trade in it, so its result is exactly the negative of the traders' aggregate PnL.",
          "A 2% fee on winning profit flows back in. Whatever is not reserved by an open pool is the reserve. The fund is bootstrapped by operator capital, not fees — at launch there is no trading to generate them.",
        ],
        code: `fund.total     = Σ entries             // append-only
fund.allocated = Σ reservation(open pools)
fund.reserve   = total − allocated
pool.result    = −Σ trader.pnl
fee            = Σ max(pnl, 0) × feeBps / 10_000   // rounded down, trader's favour`,
        lang: "math",
      },
      {
        id: "unfunded",
        heading: "Unfunded pools do not quote",
        paragraphs: [
          "If the reserve cannot cover a pool, the pool opens unfunded and refuses to quote with POOL_NOT_FUNDED. It does not fall back to a default price: a pool with no counterparty has no honest odds, so it shows none. The worker retries funding every tick, so a pool opened into an empty fund goes live once money arrives.",
        ],
      },
      {
        id: "fee-choice",
        heading: "Why 2% of profit",
        paragraphs: [
          "A fee f on profit raises the break-even hit rate on an even-money bet to 1 / (2 − f). At 2% that is 50.5%. At 20% of profit it is 55.6%, and at 20% of stake 62.5% — beyond what sustained forecasters achieve. A fee high enough to make every bet negative expectancy also makes the Kelly engine refuse every bet.",
        ],
      },
    ],
  ),

  // ------------------------------------------------------------------------ Scoring
  reputation: article(
    "reputation",
    "Scoring",
    "Brier & calibration",
    "Every resolved, filled forecast is scored. Only what actually traded counts.",
    "live",
    [
      {
        id: "brier",
        heading: "The Brier score",
        paragraphs: [
          "For a forecast f of an event with outcome o ∈ {0, 1}, the Brier score is (f − o)². It is a strictly proper scoring rule: your expected score is minimised only by reporting your true belief, so there is no strategic advantage to shading your confidence.",
          "Scores are stored in integer micros. Confidence is in basis points, so the squared difference is in bps² and divided by 100 to land in micros, where 1,000,000 is the worst possible score.",
        ],
        code: `// src/server/reputation/metrics.ts
brier = (impliedYesBps − outcomeBps)² / 100      // micros; 0 = perfect, 1e6 = worst`,
        lang: "math",
      },
      {
        id: "calibration",
        heading: "Calibration",
        paragraphs: [
          "Forecasts are bucketed by confidence. A calibrated forecaster's 70% bucket resolves true about 70% of the time. The calibration curve plots stated confidence against realised frequency; the gap between them is how over- or under-confident you are.",
        ],
      },
      {
        id: "integrity",
        heading: "What cannot be gamed",
        paragraphs: [
          "Only resolved, filled positions are scored. An order that never executed is not a forecast anyone paid for, and counting it would let you pad a record for free. The confidence scored is the one in force at the market's resolution cutoff: late bets and late adjustments cannot rewrite a historical score. Scoring is idempotent per prediction, so concurrent or retried workers score once.",
        ],
      },
    ],
  ),

  conviction: article(
    "conviction",
    "Scoring",
    "Conviction",
    "What VEYRA traders believe, weighted by the capital behind it — against the venue price.",
    "live",
    [
      {
        id: "formula",
        heading: "The blend",
        paragraphs: [
          "Each wallet's implied P(YES) is the capital-weighted mean of its YES and NO holdings, so a hedger lands between sides rather than being double-counted. Conviction blends the equal-weight mean across wallets with the capital-weighted mean, controlled by VEYRA_CONVICTION_CAPITAL_BLEND_BPS.",
          "Divergence is Conviction minus the Polymarket midpoint. A venue price is where marginal size clears; Conviction is what the participants actually believe. When they disagree, one of them is wrong, and that gap is the signal.",
        ],
        code: `implied(w)  = Σ capital_yes·conf / Σ capital          // per wallet
equalMean   = mean_w implied(w)
capMean     = Σ_w capital_w·implied(w) / Σ_w capital_w
conviction  = blend·capMean + (1 − blend)·equalMean
divergence  = conviction − polymarketMid`,
        lang: "math",
      },
      {
        id: "determinism",
        heading: "Deterministic and auditable",
        paragraphs: [
          "Only real filled positions count — never pending, failed or zero-fill. Every snapshot carries an inputs hash, so the same inputs always produce the same number and a published figure can be reproduced. It streams over Server-Sent Events and is never derived client-side.",
        ],
      },
    ],
  ),

  // ------------------------------------------------------------------------- Ledger
  "fill-ledger": article(
    "fill-ledger",
    "Ledger",
    "Fill-driven ledger",
    "Positions change only from recorded venue fills. Never from intent.",
    "live",
    [
      {
        id: "rule",
        heading: "The rule",
        paragraphs: [
          "A new position starts at zero shares. Shares, notional and payout grow only when the venue reports a fill, applied inside a transaction that holds a row lock on the position. The engine's intended size lives on the execution request, not on the position.",
          "This is the single most important invariant in the system. A ledger that records what was requested rather than what happened will, eventually, show a position nobody owns.",
        ],
      },
      {
        id: "dedupe",
        heading: "Exactly once per venue trade",
        paragraphs: [
          "Fills are unique per (executionId, venueTradeId). A reconciler that sees the same trade twice — from a retry, a crashed worker, or a concurrent sync — inserts nothing the second time, and the transaction rolls back cleanly.",
        ],
        code: `@@unique([executionId, venueTradeId])     // on Fill
SELECT ... FROM "Position" WHERE id = $1 FOR UPDATE   // before any read that feeds the write`,
        lang: "sql",
      },
    ],
  ),

  precision: article(
    "precision",
    "Ledger",
    "Money precision",
    "No floats. Ever. Every amount is an exact integer.",
    "live",
    [
      {
        id: "units",
        heading: "Units",
        paragraphs: [
          "USDC and shares are stored as BigInt micros (10⁻⁶), matching USDC's on-chain decimals. Prices and confidences are integer basis points (10⁻⁴). A tokenized asset records its own decimals beside the amount so it round-trips exactly.",
          "IEEE-754 doubles cannot represent 0.1. In a money system that is not a curiosity: summed across enough fills it becomes a balance that does not reconcile.",
        ],
      },
      {
        id: "rounding",
        heading: "Every rounding has a direction",
        paragraphs: [
          "Integer division truncates, so each division is a decision about who absorbs the remainder. The direction is chosen per formula, not left to the language.",
        ],
        code: `LMSR cost          → round UP     (pool never undercharged)
LMSR proceeds      → round DOWN   (pool never overpays)
fee reserve        → round UP     (under-reserving leaks the fee)
pool fee           → round DOWN   (trader's favour)
general divRound   → half-up`,
        lang: "text",
      },
      {
        id: "checks",
        heading: "Enforced by the database",
        paragraphs: [
          "Application code guards every write, but CHECK constraints guard the table: balances can never go negative, a hold can never record spending more than it reserved, share and notional amounts can never be negative. A future writer that bypasses the application still cannot corrupt the ledger.",
        ],
      },
    ],
  ),

  concurrency: article(
    "concurrency",
    "Ledger",
    "Concurrency & idempotency",
    "Every money path is safe to run twice, and safe to run from two workers at once.",
    "live",
    [
      {
        id: "claims",
        heading: "Atomic claims",
        paragraphs: [
          "State transitions are claims, not read-then-write: UPDATE … WHERE status = 'ACTIVE' and act only if exactly one row changed. Two workers racing the same transition cannot both win.",
          "Order matters. A refund claims the row before crediting, never after — credit-then-claim lets a concurrent completion take the row while the refund lands anyway, paying twice.",
        ],
      },
      {
        id: "locks",
        heading: "Row locks where counts race",
        paragraphs: [
          "Any check of the form 'count, then insert if below the limit' races under READ COMMITTED: two requests both read limit − 1 and both commit. Vote budgets, fund reservations and position writes take SELECT … FOR UPDATE first, so the second request sees the first one's effect.",
        ],
      },
      {
        id: "idempotency",
        heading: "Idempotency keys",
        paragraphs: [
          "Every ledger entry is unique per (refType, refId, kind). A payout keyed by Position.id, a deposit by (chainId, txHash, logIndex), a sell credit by Fill.id — replaying any of them is a no-op. Client orders carry an idempotency key, so a network retry returns the original order rather than placing a second.",
        ],
        code: `@@unique([refType, refId, kind])            // ledger
@@unique([chainId, txHash, logIndex])       // deposits
CREATE UNIQUE INDEX ... WHERE status = 'OPEN'  // one open voting round, ever`,
        lang: "sql",
      },
      {
        id: "verification",
        heading: "Verified by mutation",
        paragraphs: [
          "Every protection has a test that fails when the protection is removed. Delete a row lock, reorder a claim, drop a CHECK constraint — the suite goes red. A test that passes either way proves nothing, and several were found and rewritten for exactly that reason.",
        ],
      },
    ],
  ),

  // ------------------------------------------------------------------------ Custody
  custody: article(
    "custody",
    "Custody",
    "Two-wallet custody",
    "User funds and trading capital never share a wallet. The server cannot spend deposits.",
    "in-progress",
    [
      {
        id: "wallets",
        heading: "Two wallets",
        paragraphs: [
          "Treasury (X) holds user deposits. Execution (Y) is the omnibus wallet that trades on Polymarket. A bet debits the user's ledger balance, but the funds stay in X; Y fronts the trade. Resolution credits the user's balance; withdrawal pays from X.",
          "The treasury is watch-only. There is no treasury private key in the environment — boot fails if one is set — and boot also fails if X and Y resolve to the same address. A compromised server can place bad trades from Y; it cannot move user deposits.",
        ],
      },
      {
        id: "holds",
        heading: "Reserve, then release",
        paragraphs: [
          "Placing an order debits notional plus worst-case fee and writes a hold as the receipt, inside the same transaction as the order. INSUFFICIENT_FUNDS rolls back the order row too. When the execution is terminal, the unspent remainder is released. A release only ever returns money, so running late is conservative.",
        ],
        code: `reserve  = notional + ⌈notional × VEYRA_FEE_RESERVE_BPS / 10_000⌉
spent    = Σ fill.notional + Σ fill.fee
refund   = reserve − min(spent, reserve)`,
        lang: "math",
      },
      {
        id: "fee-bound",
        heading: "Why the fee reserve is enough",
        paragraphs: [
          "The venue's taker fee is shares × rate × p × (1 − p). As a fraction of notional (shares × p) that is rate × (1 − p), maximised as p → 0 and bounded above by the rate itself. Reserving notional × rate therefore covers any fill the venue can produce — provided VEYRA_FEE_RESERVE_BPS is at least the venue's actual rate.",
        ],
      },
      {
        id: "status",
        heading: "Status",
        paragraphs: [
          "Built and tested, switched off behind VEYRA_CUSTODY_ENABLED. It has not yet processed real deposits.",
        ],
      },
    ],
  ),

  deposits: article(
    "deposits",
    "Custody",
    "Deposits & reorgs",
    "A deposit is credited only after it is final — and reversed honestly if it stops being so.",
    "in-progress",
    [
      {
        id: "watcher",
        heading: "The watcher",
        paragraphs: [
          "The watcher scans Transfer logs into the treasury, crediting only transfers at least VEYRA_DEPOSIT_CONFIRMATIONS blocks deep. It keeps a persisted per-chain cursor and advances it only after the range is credited, so a crash re-scans rather than skipping — safe, because crediting is idempotent per (chainId, txHash, logIndex).",
          "The span per tick is capped, so catching up after an outage takes several ticks instead of one query the RPC would refuse.",
        ],
      },
      {
        id: "reorg",
        heading: "Reorgs",
        paragraphs: [
          "If a credited transfer disappears from the chain, the deposit is reversed whatever the balance looks like. If the user already spent it, the reversal claws back what is there and records the remainder as unrecovered — real money the system is short, reported as a solvency error. It never leaves a vanished deposit marked credited.",
        ],
      },
    ],
  ),

  solvency: article(
    "solvency",
    "Custody",
    "Solvency invariant",
    "Claims plus house capital must equal USDC actually controlled — read from chain, not from config.",
    "in-progress",
    [
      {
        id: "invariant",
        heading: "The invariant",
        paragraphs: [
          "Σ user balances + Σ active holds + house capital ≤ USDC controlled. The load-bearing word is controlled: the right-hand side is read from the omnibus wallet on-chain, independently of the ledger it checks. A figure typed into configuration makes the comparison self-confirming, and the report says so.",
        ],
        code: `claims     = Σ balance + Σ (hold.amount − hold.spent)
controlled = onchain(omnibus).usdc + onchain(treasury).usdc
INSOLVENT  ⇔ claims + house > controlled`,
        lang: "math",
      },
      {
        id: "liquidity",
        heading: "Per-wallet liquidity",
        paragraphs: [
          "Total solvency can hold while the treasury is empty: a winning bet leaves proceeds in Y while X owes the payout. The liquidity check compares X's on-chain balance to claims plus pending withdrawals and reports the exact amount to sweep from Y — alerting inside a buffer, before a withdrawal can fail, not after.",
        ],
      },
      {
        id: "report-only",
        heading: "Report, never correct",
        paragraphs: [
          "The solvency job writes nothing. A shortfall is an incident for a human, resolved with an explicit adjustment that names who made it. Automatic correction would hide exactly the discrepancies the check exists to surface.",
        ],
      },
    ],
  ),

  // --------------------------------------------------------------------- Governance
  "daily-voting": article(
    "daily-voting",
    "Governance",
    "Daily voting",
    "The community proposes and votes. The top five become markets every 24 hours.",
    "live",
    [
      {
        id: "lifecycle",
        heading: "OPEN → CLOSED → FINALIZED",
        paragraphs: [
          "One round runs at a time — enforced by a partial unique index, so concurrent workers cannot open a second. Closing and finalizing are separate idempotent steps: a worker that crashes after closing leaves a round the next tick finishes, where a combined step would strand it.",
        ],
      },
      {
        id: "rules",
        heading: "Rules",
        paragraphs: [
          "Each wallet has three votes per round, one per proposal. Voting twice for the same proposal is a no-op. The budget is enforced under a lock on the round row, because a count check races. Proposers cannot trade a pool opened from their own question.",
        ],
      },
      {
        id: "frozen",
        heading: "The frozen tally",
        paragraphs: [
          "At close the ranking is written once and never recomputed. Ties break by vote count, then earlier submission, then id — and the resolved rank is stored, so the tiebreak is auditable after the fact. A proposal with zero votes never wins.",
        ],
      },
    ],
  ),

  // ----------------------------------------------------------------------- Protocol
  architecture: article(
    "architecture",
    "Protocol",
    "Architecture",
    "Where each responsibility lives today, and where it is going.",
    "in-progress",
    [
      {
        id: "today",
        heading: "Today",
        paragraphs: [
          "Matching for external markets is Polymarket's CLOB. VEYRA-native pools are priced by an LMSR maker on the VEYRA server. Custody, scoring and Conviction run on a PostgreSQL ledger with a background worker driven by cron. Resolution references are written to Robinhood Chain.",
        ],
      },
      {
        id: "target",
        heading: "Target",
        paragraphs: [
          "The target moves trust off the server layer by layer: order matching with on-chain settlement, a settlement contract holding collateral, and an optimistic oracle for VEYRA-native resolution. Each is documented on its own page with its current status.",
        ],
        code: `layer          today                       target
matching       Polymarket CLOB / LMSR      hybrid CLOB, on-chain settlement   [planned]
custody        ledger + watch-only wallet  settlement contract                [planned]
resolution     venue / operator + dispute  optimistic oracle                  [planned]
references     Robinhood Chain             Robinhood Chain                    [live]`,
        lang: "text",
      },
    ],
  ),

  "onchain-matching": article(
    "onchain-matching",
    "Protocol",
    "On-chain matching",
    "Off-chain order matching with on-chain, atomic settlement — the design used by the fastest prediction venues.",
    "planned",
    [
      {
        id: "why-hybrid",
        heading: "Why hybrid",
        paragraphs: [
          "Fully on-chain order books pay gas on every placement and cancellation, and expose every order to front-running. The proven design matches off-chain and settles on-chain: makers and takers sign EIP-712 orders, an operator matches them, and a contract verifies both signatures and swaps collateral for outcome tokens atomically. The operator can refuse to match; it cannot fill an order at a price the signer did not sign.",
        ],
      },
      {
        id: "orders",
        heading: "Signed orders",
        paragraphs: [
          "An order is a typed struct — maker, token id, side, maker amount, taker amount, expiration, nonce, fee rate — signed by the maker. The contract checks the signature, that the order is unexpired and unfilled, and that the implied price crosses. Partial fills are tracked per order hash, so an order can never be over-filled.",
        ],
        code: `struct Order {
  address maker;   uint256 tokenId;   uint8 side;
  uint256 makerAmount;   uint256 takerAmount;
  uint256 expiration;    uint256 nonce;   uint256 feeRateBps;
}
// settle(Order a, Order b, bytes sigA, bytes sigB, uint256 fillAmount)`,
        lang: "solidity",
      },
      {
        id: "confidence-fit",
        heading: "How confidence fits",
        paragraphs: [
          "The confidence engine is unchanged: it still produces a sized limit order from a stated probability. What changes is where that order settles. Kelly sizing and the fill-driven ledger were designed so the venue underneath can be swapped without touching either.",
        ],
      },
      {
        id: "status",
        heading: "Status",
        paragraphs: [
          "Planned. External markets currently match on Polymarket's CLOB, which already uses this hybrid model on Polygon.",
        ],
      },
    ],
  ),

  "smart-contracts": article(
    "smart-contracts",
    "Protocol",
    "Smart contracts",
    "The settlement contract that would move custody from a ledger to code.",
    "planned",
    [
      {
        id: "scope",
        heading: "Scope",
        paragraphs: [
          "A settlement contract would hold collateral and mint complementary outcome tokens — one YES and one NO per unit of collateral, the conditional-token model — so that every winning share is always fully backed. Payout becomes a redemption the user triggers, not a transfer an operator sends.",
        ],
      },
      {
        id: "invariant",
        heading: "The on-chain invariant",
        paragraphs: [
          "Minting only in complementary pairs means total YES supply equals total NO supply equals locked collateral, for every market, at every block. The solvency invariant that today is checked off-chain by a job would instead be enforced by construction.",
        ],
        code: `split(amount):  collateral -= amount;  YES += amount;  NO += amount
merge(amount):  YES -= amount;  NO -= amount;  collateral += amount
redeem():       payout = winningShares × 1`,
        lang: "solidity",
      },
      {
        id: "status",
        heading: "Status",
        paragraphs: [
          "Planned. No contracts are deployed. Custody today is the two-wallet ledger described under Custody.",
        ],
      },
    ],
  ),

  oracles: article(
    "oracles",
    "Protocol",
    "Oracles",
    "How outcomes become final — today, and with an optimistic oracle.",
    "in-progress",
    [
      {
        id: "today",
        heading: "Today",
        paragraphs: [
          "Polymarket-backed markets resolve from the venue, which uses UMA's optimistic oracle. VEYRA-native pools are resolved by an operator, and payouts are held behind a dispute window (default 24 hours) before they can be released.",
        ],
      },
      {
        id: "optimistic",
        heading: "Optimistic resolution",
        paragraphs: [
          "An optimistic oracle assumes a proposed outcome is correct unless someone disputes it within a window, posting a bond. An uncontested proposal finalises cheaply; a dispute escalates to a vote. Security comes from the economics: a false proposal is profitable to dispute.",
        ],
        code: `propose(outcome, bond)
  → liveness window
  → no dispute: final
  → dispute(bond): escalate to vote; loser forfeits bond`,
        lang: "text",
      },
      {
        id: "status",
        heading: "Status",
        paragraphs: [
          "In progress. External markets inherit the venue's oracle. An optimistic oracle for VEYRA-native pools is planned; until then, operator resolution is the trusted component.",
        ],
      },
    ],
  ),

  settlement: article(
    "settlement",
    "Protocol",
    "Settlement",
    "Resolved outcomes are anchored to Robinhood Chain.",
    "live",
    [
      {
        id: "references",
        heading: "Settlement references",
        paragraphs: [
          "When a position is scored, a settlement reference is written to Robinhood Chain (testnet 46630, mainnet 4663). The reference links the VEYRA prediction id to an on-chain transaction, and only a mined, confirmed receipt is reported as final.",
          "Submission is idempotent per prediction, bounded by a max fee, and retried with backoff; a reverted or failed transaction is recorded as such rather than silently retried forever.",
        ],
        code: `status: queued → signing → signed → submitted → confirmed
                                                   ↘ reverted | failed`,
        lang: "text",
      },
    ],
  ),

  // --------------------------------------------------------------------- Developers
  "api-overview": article(
    "api-overview",
    "Developers",
    "API overview",
    "A JSON HTTP API. Money is strings, errors are typed, writes are idempotent.",
    "live",
    [
      {
        id: "conventions",
        heading: "Conventions",
        paragraphs: [
          "Every amount is a decimal string or an integer string of micros — never a JSON number, which would lose precision. Errors have a stable machine-readable code alongside a human message; branch on the code. Mutating calls take an idempotency-key header, and a retry with the same key returns the original result.",
        ],
        code: `{ "error": { "code": "VOTE_LIMIT", "message": "You have used all 3 of your votes for this round." } }`,
        lang: "json",
      },
    ],
  ),

  "rest-api": article(
    "rest-api",
    "Developers",
    "REST API",
    "The endpoints that matter.",
    "live",
    [
      {
        id: "trading",
        heading: "Trading",
        paragraphs: [],
        code: `POST  /api/predictions/quote                 quote a confidence
POST  /api/predictions                       place   (idempotency-key)
GET   /api/predictions/:id                   poll execution + position
PATCH /api/predictions/:id/confidence        Change Your Mind
GET   /api/markets/:id/book?outcome=YES       live or LMSR book`,
        lang: "http",
      },
      {
        id: "scoring",
        heading: "Scoring & governance",
        paragraphs: [],
        code: `GET   /api/users/:wallet/reputation           Brier + calibration
GET   /api/markets/:id/conviction             capital-weighted belief
GET   /api/voting/round                       current round + live tally
POST  /api/voting/votes                       cast a vote
GET   /api/voting/rounds/:id                  frozen result`,
        lang: "http",
      },
    ],
  ),

  streams: article(
    "streams",
    "Developers",
    "Streams",
    "Conviction pushed over Server-Sent Events.",
    "live",
    [
      {
        id: "sse",
        heading: "Server-Sent Events",
        paragraphs: [
          "Conviction streams from /api/markets/:id/conviction/stream as text/event-stream. Each event is a full snapshot with an inputs hash, so a client that drops a message loses nothing — the next snapshot supersedes it. Fall back to polling the plain endpoint if the stream closes.",
        ],
        code: `const es = new EventSource(\`/api/markets/\${id}/conviction/stream\`);
es.onmessage = (e) => render(JSON.parse(e.data)); // full snapshot each time`,
        lang: "ts",
      },
    ],
  ),

  // ---------------------------------------------------------------------- Resources
  security: article(
    "security",
    "Resources",
    "Security model",
    "What you trust, what you do not, and what a compromise can reach.",
    "live",
    [
      {
        id: "trusted",
        heading: "Trusted components",
        paragraphs: [
          "The VEYRA server, for matching VEYRA-native pools and for applying fills to the ledger. The operator, for resolving VEYRA-native pools (behind a dispute window). Polymarket, for external matching and resolution. These are stated plainly because a security model that hides its trust assumptions is not one.",
        ],
      },
      {
        id: "blast-radius",
        heading: "Blast radius",
        paragraphs: [
          "The server holds the execution wallet's key, so a server compromise can place trades from it — bounded by position limits and per-pool loss caps. It holds no treasury key, so it cannot move user deposits. Withdrawals are operator-executed from a wallet the server does not control.",
        ],
      },
      {
        id: "defences",
        heading: "Defences",
        paragraphs: [
          "Wallet-signature sessions with single-use nonces. HMAC-signed HttpOnly cookies. Same-origin checks on writes. Rate limiting. Integer money with database CHECK constraints. Every money transition idempotent and claim-guarded. Every protection covered by a test that fails when it is removed.",
        ],
      },
    ],
  ),

  glossary: article(
    "glossary",
    "Resources",
    "Glossary",
    "Terms used across these docs.",
    "live",
    [
      {
        id: "terms",
        heading: "Terms",
        paragraphs: [
          "bps — basis points, 1/10,000. Prices and confidences are stored in bps.",
          "micros — 1/1,000,000 of a unit. All USDC and share amounts are integer micros.",
          "Kelly fraction — the growth-optimal share of bankroll to stake given an edge.",
          "LMSR — logarithmic market scoring rule; an AMM with a bounded worst-case loss.",
          "b — the LMSR liquidity parameter. Larger b means a deeper book and a larger maximum loss.",
          "Brier score — squared error between a forecast and the outcome. Lower is better.",
          "Conviction — capital-weighted belief of VEYRA traders on a market.",
          "Divergence — Conviction minus the venue price.",
          "Hold — funds reserved against an open order.",
          "Treasury (X) / Execution (Y) — the deposit wallet and the trading wallet.",
          "FAK / FOK / GTC — fill-and-kill, fill-or-kill, good-til-cancelled.",
        ],
      },
    ],
  ),

  changelog: article(
    "changelog",
    "Resources",
    "Changelog",
    "What changed, and what was found.",
    "live",
    [
      {
        id: "v1",
        heading: "v1.0",
        paragraphs: [
          "Confidence engine with fractional Kelly. Change Your Mind with delta execution. Brier reputation and calibration. Conviction with divergence. Daily voting. LMSR pools with a fee-funded liquidity fund. Two-wallet custody with a chain-sourced solvency invariant, deposit watcher and reorg handling. Robinhood Chain settlement references.",
          "Hardening: eight custody defects found in review and fixed — each one looked correct and failed precisely in the case it existed for. Every protection now has a test that fails when it is removed.",
        ],
      },
    ],
  ),
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

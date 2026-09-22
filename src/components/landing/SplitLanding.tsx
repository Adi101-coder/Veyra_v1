"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { siteConfig } from "@/lib/site";
import "./split-landing.css";

const MARKET_PROBABILITY = 61;

const chartSeries: Record<string, number[]> = {
  "1H": [54, 53, 52, 54, 50, 49, 50, 54, 55, 54, 56, 58, 57, 56, 58, 59, 58, 60, 59, 61],
  "1D": [43, 45, 41, 43, 46, 48, 47, 44, 46, 51, 49, 54, 52, 56, 57, 55, 59, 58, 62, 61],
  "1W": [31, 34, 33, 39, 37, 42, 40, 39, 45, 44, 49, 47, 50, 48, 54, 52, 58, 57, 63, 61],
  "1M": [52, 49, 44, 46, 41, 39, 38, 43, 45, 42, 46, 50, 48, 53, 54, 52, 58, 56, 60, 61],
};

const periodNames: Record<string, string> = {
  "1H": "Past hour",
  "1D": "Past day",
  "1W": "Past week",
  "1M": "Past month",
};

function chartPaths(series: number[]) {
  const points = series.map(
    (value, index) =>
      `${((index / (series.length - 1)) * 400).toFixed(1)} ${(136 - ((value - 20) / 60) * 136).toFixed(1)}`
  );
  const line = `M${points.join(" L")}`;
  return { line, area: `${line} V136 H0 Z` };
}

function SplitLogo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/split-assets/split-logo.png" alt="Split" width={2172} height={724} className={className} />
  );
}

export function SplitLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [period, setPeriod] = useState("1W");
  const [probability, setProbability] = useState(76);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const { line, area } = chartPaths(chartSeries[period]);
  const edge = probability - MARKET_PROBABILITY;
  const edgeText = `${edge > 0 ? "+" : edge < 0 ? "−" : ""}${Math.abs(edge)} ${
    Math.abs(edge) === 1 ? "percentage point" : "percentage points"
  }`;

  return (
    <div className="split-landing">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="page-shell">
        <header className="site-header">
          <a className="brand" href="#" aria-label="Split home">
            <SplitLogo />
          </a>
          <nav
            id="primary-nav"
            className={menuOpen ? "nav-links is-open" : "nav-links"}
            aria-label="Main navigation"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) closeMenu();
            }}
          >
            <a href="#markets">Markets</a>
            <a href="#how-it-works">How it works</a>
            <a href="#technology">Technology</a>
            <a href="#faq">FAQ</a>
            <a href={siteConfig.x.href} target="_blank" rel="noopener noreferrer">
              X
            </a>
          </nav>
          <Link className="button header-launch" href="/markets">
            Launch app <span aria-hidden="true">↗</span>
          </Link>
          <button
            className="menu-toggle"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="primary-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span></span>
            <span></span>
          </button>
        </header>
        <main id="main">
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-copy">
              <p className="eyebrow">
                <span className="tiny-star" aria-hidden="true">
                  ✳
                </span>{" "}
                THE FUTURE IS AN OPEN QUESTION
              </p>
              <h1 id="hero-title">
                Trade the future,
                <br />
                <em>Split with conviction.</em>
              </h1>
              <p className="hero-description">
                Instead of a one-word bet, Split lets you split your confidence across outcomes in
                percentages. State how likely an outcome is. That probability is your order.
              </p>
              <div className="hero-actions">
                <Link className="button button-primary" href="/markets">
                  Explore markets <span aria-hidden="true">↗</span>
                </Link>
                <a className="text-link" href="#how-it-works">
                  How it works <span aria-hidden="true">↘</span>
                </a>
              </div>
              <div className="hero-footnote">
                <span className="chain-icon" aria-hidden="true">
                  ◇
                </span>{" "}
                Your probability. Kelly-sized orders.
              </div>
            </div>
            <div className="hero-visual">
              <div className="visual-frame" aria-hidden="true">
                <span className="frame-label">A VIEW OF WHAT’S NEXT</span>
                <span className="frame-index">FIG. 01 / POSSIBILITIES</span>
              </div>
              <div className="market-preview">
                <div className="preview-topline">
                  <span className="mini-brand">
                    <span className="brand brand-preview">
                      <SplitLogo />
                    </span>
                    <span>MARKETS</span>
                  </span>
                  <span className="sample-label">Demo market</span>
                </div>
                <div className="market-heading">
                  <span className="market-symbol" aria-hidden="true">
                    H
                  </span>
                  <div>
                    <span className="eyebrow market-category">CRYPTO · YEAR-END</span>
                    <h2>
                      Hype goes sub-$50
                      <br />
                      by end of year?
                    </h2>
                  </div>
                </div>
                <div className="odds-row">
                  <div>
                    <strong>
                      61<span>%</span>
                    </strong>
                    <span className="odds-label">Market probability</span>
                  </div>
                  <span className="chart-caption">Illustrative odds</span>
                </div>
                <div className="chart-wrap">
                  <div className="chart-grid" aria-hidden="true">
                    <span>80%</span>
                    <span>50%</span>
                    <span>20%</span>
                  </div>
                  <svg
                    className="odds-chart"
                    viewBox="0 0 400 136"
                    role="img"
                    aria-label={`${periodNames[period]} illustrative probability chart ending at 61 percent`}
                  >
                    <defs>
                      <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#265bff" stopOpacity=".19" />
                        <stop offset="100%" stopColor="#265bff" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path id="chart-area" d={area} fill="url(#chart-fill)" />
                    <path
                      id="chart-line"
                      d={line}
                      fill="none"
                      stroke="#265bff"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="chart-bottom">
                  <span id="chart-period">{periodNames[period]} · sample data</span>
                  <div className="period-buttons" role="group" aria-label="Chart period">
                    {Object.keys(chartSeries).map((key) => (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={period === key}
                        onClick={() => setPeriod(key)}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                </div>
                <Link className="preview-open" href="/contract/hype">
                  <span className="yes-price">
                    Below $50 <b>61%</b>
                  </span>
                  <span className="no-price">
                    $50 or above <b>39%</b>
                  </span>
                  <span className="open-arrow" aria-label="Open market">
                    ↗
                  </span>
                </Link>
              </div>
              <div className="floating-note">
                <span aria-hidden="true">✳</span>
                <p>
                  The next chapter
                  <br />
                  is yours to call.
                </p>
              </div>
            </div>
          </section>
          <div className="category-strip">
            <span className="strip-title">A world worth watching</span>
            <div>
              <span>Crypto</span>
              <i aria-hidden="true">✳</i>
              <span>Finance</span>
              <i aria-hidden="true">✳</i>
              <span>Technology</span>
              <i aria-hidden="true">✳</i>
              <span>Culture</span>
              <i aria-hidden="true">✳</i>
              <span>Sports</span>
            </div>
            <a href="#markets" aria-label="Discover the markets">
              ↓
            </a>
          </div>
          <section className="section markets-section" id="markets" aria-labelledby="markets-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">01 / THE MARKET FLOOR</p>
                <h2 id="markets-title">
                  What happens <em>next?</em>
                </h2>
              </div>
              <div>
                <p>Not a feed of tickers. A floor of questions.</p>
                <Link className="text-link" href="/markets">
                  Explore all markets <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </div>
            <p className="demo-note">Sample markets · demo odds</p>
            <div className="market-grid">
              <Link className="market-card" href="/contract/hype">
                <div className="card-meta">
                  <span>CRYPTO</span>
                  <span className="card-glyph" aria-hidden="true">
                    H
                  </span>
                </div>
                <h3>
                  Hype goes sub-$50
                  <br />
                  by end of year?
                </h3>
                <div className="card-odds">
                  <strong>
                    61<span>%</span>
                  </strong>
                  <span>market probability</span>
                </div>
                <div className="probability-bar" aria-hidden="true">
                  <span style={{ width: "61%" }}></span>
                </div>
                <div className="card-bottom">
                  <span>Set your confidence</span>
                  <span aria-label="Open market">↗</span>
                </div>
              </Link>
              <Link className="market-card" href="/contract/vantage-mcap">
                <div className="card-meta">
                  <span>ECOSYSTEM</span>
                  <span className="card-glyph glyph-split" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/split-assets/favicon.svg" alt="" width={34} height={34} />
                  </span>
                </div>
                <h3>Split hits a $5M market cap in its first week?</h3>
                <div className="card-odds">
                  <strong>
                    54<span>%</span>
                  </strong>
                  <span>market probability</span>
                </div>
                <div className="probability-bar" aria-hidden="true">
                  <span style={{ width: "54%" }}></span>
                </div>
                <div className="card-bottom">
                  <span>Set your confidence</span>
                  <span aria-label="Open market">↗</span>
                </div>
              </Link>
              <Link className="market-card" href="/contract/topuria">
                <div className="card-meta">
                  <span>SPORTS</span>
                  <span className="card-glyph glyph-sport" aria-hidden="true">
                    IT
                  </span>
                </div>
                <h3>
                  Ilia Topuria wins
                  <br />
                  his next UFC fight?
                </h3>
                <div className="card-odds">
                  <strong>
                    50<span>%</span>
                  </strong>
                  <span>market probability</span>
                </div>
                <div className="probability-bar" aria-hidden="true">
                  <span style={{ width: "50%" }}></span>
                </div>
                <div className="card-bottom">
                  <span>Set your confidence</span>
                  <span aria-label="Open market">↗</span>
                </div>
              </Link>
              <Link className="market-card" href="/contract/jimothy">
                <div className="card-meta">
                  <span>CULTURE</span>
                  <span className="card-glyph glyph-culture" aria-hidden="true">
                    J
                  </span>
                </div>
                <h3>Second Jimothy confirmed by end of year?</h3>
                <div className="card-odds">
                  <strong>
                    85<span>%</span>
                  </strong>
                  <span>market probability</span>
                </div>
                <div className="probability-bar" aria-hidden="true">
                  <span style={{ width: "85%" }}></span>
                </div>
                <div className="card-bottom">
                  <span>Set your confidence</span>
                  <span aria-label="Open market">↗</span>
                </div>
              </Link>
            </div>
          </section>
          <section className="section conviction-section" id="insights" aria-labelledby="conviction-title">
            <div className="conviction-copy">
              <p className="eyebrow">02 / INTRODUCING SPLIT</p>
              <h2 id="conviction-title">
                A question.
                <br />
                A percentage.
                <br />
                <em>Your conviction.</em>
              </h2>
              <p className="section-description">
                Give your prediction a percentage. Your confidence becomes the input to an order,
                and the engine compares it with the live market before sizing a position.
              </p>
              <div className="principles">
                <div>
                  <span aria-hidden="true">◇</span>
                  <div>
                    <h3>Rules before the first trade</h3>
                    <p>
                      Every market states its claim and resolution criteria before participants take
                      a position.
                    </p>
                  </div>
                </div>
                <div>
                  <span aria-hidden="true">⇄</span>
                  <div>
                    <h3>Confidence, expressed precisely</h3>
                    <p>
                      Split your confidence across outcomes. A 76% forecast communicates how likely
                      you think an outcome is.
                    </p>
                  </div>
                </div>
                <div>
                  <span aria-hidden="true">↳</span>
                  <div>
                    <h3>A reputation built on accuracy</h3>
                    <p>
                      At resolution, your forecast is scored against the actual outcome and
                      contributes to your reputation.
                    </p>
                  </div>
                </div>
              </div>
              <Link className="text-link" href="/docs?page=introduction">
                Read the introduction <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <div className="position-panel confidence-panel">
              <div className="position-heading">
                <span className="eyebrow">YOUR CONFIDENCE</span>
                <span className="sample-label">Demo</span>
              </div>
              <h3>
                Hype goes sub-$50
                <br />
                by end of year?
              </h3>
              <div className="confidence-value">
                <label htmlFor="confidence-percent">Your probability of below $50</label>
                <output id="confidence-value" htmlFor="confidence-percent">
                  {probability}
                  <span>%</span>
                </output>
              </div>
              <input
                className="confidence-slider"
                type="range"
                id="confidence-percent"
                min={0}
                max={100}
                step={1}
                value={probability}
                aria-describedby="confidence-help confidence-note"
                aria-valuetext={`${probability}% below $50; ${100 - probability}% at $50 or above`}
                style={{ "--confidence": `${probability}%` } as React.CSSProperties}
                onChange={(event) => setProbability(Number(event.target.value))}
              />
              <p className="confidence-help" id="confidence-help">
                Move the slider to split your confidence.
              </p>
              <div className="confidence-distribution" aria-hidden="true">
                <span id="confidence-fill" style={{ width: `${probability}%` }}></span>
              </div>
              <div className="confidence-outcomes">
                <div>
                  <span>Below $50</span>
                  <output id="below-confidence" htmlFor="confidence-percent">
                    {probability}%
                  </output>
                </div>
                <div>
                  <span>$50 or above</span>
                  <output id="above-confidence" htmlFor="confidence-percent">
                    {100 - probability}%
                  </output>
                </div>
              </div>
              <div className="confidence-book">
                <span>
                  Market probability <i>q</i>
                </span>
                <span>61%</span>
              </div>
              <div className="confidence-edge">
                <span>
                  Your edge <i>p − q</i>
                </span>
                <output id="confidence-edge" htmlFor="confidence-percent">
                  {edgeText}
                </output>
              </div>
              <p
                className="confidence-status"
                id="confidence-status"
                aria-live="polite"
                data-has-edge={edge > 0}
              >
                {edge > 0 ? "Positive edge. Kelly determines the stake." : "No edge on below $50. No trade."}
              </p>
              <p id="confidence-note" className="position-note">
                Illustrative example with a fixed market probability. No order is placed here.
              </p>
              <Link className="button button-primary" id="position-link" href="/contract/hype">
                Open market in Split <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </section>
          <section className="section how-section confidence-how" id="how-it-works" aria-labelledby="how-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">03 / FROM CONFIDENCE TO A POSITION</p>
                <h2 id="how-title">
                  How it <em>works.</em>
                </h2>
              </div>
            </div>
            <ol className="confidence-steps">
              <li>
                <span className="confidence-step-number" aria-hidden="true">
                  01
                </span>
                <div>
                  <h3>State a probability</h3>
                  <p>
                    Pick an outcome and say how likely it is. That number is the order — not a share
                    count.
                  </p>
                </div>
              </li>
              <li>
                <span className="confidence-step-number" aria-hidden="true">
                  02
                </span>
                <div>
                  <h3>Kelly sizes it</h3>
                  <p>
                    The engine reads the live book, measures your edge{" "}
                    <span className="edge-formula">p − q</span>, and stakes a fraction of the Kelly
                    optimum. No edge, no trade.
                  </p>
                  <p className="probability-key">
                    <span>
                      <b>p</b> Your probability
                    </span>
                    <span>
                      <b>q</b> Market probability
                    </span>
                  </p>
                </div>
              </li>
              <li>
                <span className="confidence-step-number" aria-hidden="true">
                  03
                </span>
                <div>
                  <h3>Fills, then scoring</h3>
                  <p>
                    Your position changes only when the venue reports a fill. At resolution, a Brier
                    score measures your forecast’s accuracy and updates your reputation.
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <section className="section technology-section" id="technology" aria-labelledby="technology-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">04 / UNDER THE SURFACE</p>
                <h2 id="technology-title">
                  The technology
                  <br />
                  <em>behind your position.</em>
                </h2>
              </div>
              <p className="technology-intro">
                Three connected layers bring a market from its first order to its final outcome.
                Each layer can be inspected independently.
              </p>
            </div>
            <div
              className="protocol-map"
              role="group"
              aria-label="Protocol architecture: trading, oracle resolution, and settlement"
            >
              <div className="protocol-map-heading">
                <span>THE PROTOCOL</span>
                <Link href="/docs?page=architecture">
                  Explore the architecture <span aria-hidden="true">↗</span>
                </Link>
              </div>
              <ol className="protocol-layers">
                <li>
                  <span className="layer-index">01 / ORDERS</span>
                  <h3>Trading</h3>
                  <p>
                    Turns stated probabilities into orders. Kelly sizing uses your edge against the
                    live book, and positions update after venue-confirmed fills.
                  </p>
                  <Link href="/docs?page=architecture">
                    How matching fits in <span aria-hidden="true">↗</span>
                  </Link>
                </li>
                <li>
                  <span className="layer-index">02 / OUTCOME</span>
                  <h3>Oracle</h3>
                  <p>
                    Posts a signed resolution report using the market’s named source. Disputed
                    reports enter a challenge window.
                  </p>
                  <Link href="/docs?page=oracles">
                    How outcomes are reported <span aria-hidden="true">↗</span>
                  </Link>
                </li>
                <li>
                  <span className="layer-index">03 / SETTLEMENT</span>
                  <h3>Settlement</h3>
                  <p>
                    Transfers value after resolution becomes final. Published rules connect the
                    outcome to the payout.
                  </p>
                  <Link href="/docs?page=resolution">
                    How resolution becomes final <span aria-hidden="true">↗</span>
                  </Link>
                </li>
              </ol>
              <div className="contract-foundation">
                <span>CORE CONTRACTS</span>
                <div>
                  <span>Market factory</span>
                  <span>Position vault</span>
                  <span>Settlement module</span>
                </div>
                <Link href="/docs?page=smart-contracts">
                  Contract architecture <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </div>
            <div className="developer-heading">
              <div>
                <h3>One protocol. More ways in.</h3>
                <p>
                  The same market data and settlement layer, whether you use the app or build your
                  own interface.
                </p>
              </div>
              <Link className="text-link" href="/docs?page=api-overview">
                Developer overview <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <div className="developer-grid">
              <Link href="/docs?page=sdk">
                <span className="developer-label">01 / BUILD</span>
                <h4>
                  TypeScript SDK <span aria-hidden="true">↗</span>
                </h4>
                <p>Typed clients for markets, orders, and account state, wrapping REST and WebSockets.</p>
              </Link>
              <Link href="/docs?page=rest-api">
                <span className="developer-label">02 / REQUEST</span>
                <h4>
                  REST API <span aria-hidden="true">↗</span>
                </h4>
                <p>Read market data and place orders through a shared data model.</p>
              </Link>
              <Link href="/docs?page=websockets">
                <span className="developer-label">03 / STREAM</span>
                <h4>
                  WebSockets <span aria-hidden="true">↗</span>
                </h4>
                <p>Follow streams of trades, order-book updates, and market resolutions.</p>
              </Link>
              <Link href="/docs?page=webhooks">
                <span className="developer-label">04 / RECEIVE</span>
                <h4>
                  Webhooks <span aria-hidden="true">↗</span>
                </h4>
                <p>Deliver protocol events to your backend as they happen.</p>
              </Link>
            </div>
          </section>
          <section className="section faq-section" id="faq" aria-labelledby="faq-title">
            <div>
              <p className="eyebrow">05 / A FEW GOOD QUESTIONS</p>
              <h2 id="faq-title">
                Curiosity
                <br />
                <em>looks good on you.</em>
              </h2>
              <p>Start here. Go deeper in the docs.</p>
              <Link className="text-link" href="/docs">
                Visit the docs <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <div className="faq-list">
              <details open>
                <summary>
                  What is Split?<span aria-hidden="true">+</span>
                </summary>
                <p>
                  Split lets you express your confidence in outcomes as percentages. The engine uses
                  your probability and the live market to size an order, then tracks your
                  forecasting accuracy over time.
                </p>
              </details>
              <details>
                <summary>
                  How are outcomes determined?<span aria-hidden="true">+</span>
                </summary>
                <p>
                  Each market names its resolution source. An oracle submits a signed report when
                  the outcome is known. Disputed reports enter a challenge window before resolution
                  becomes final.
                </p>
              </details>
              <details>
                <summary>
                  Who is it for?<span aria-hidden="true">+</span>
                </summary>
                <p>
                  Traders, analysts, sports fans, researchers, and anyone with a strong view about
                  the future.
                </p>
              </details>
              <details>
                <summary>
                  What can I predict?<span aria-hidden="true">+</span>
                </summary>
                <p>Markets, sports, technology, politics, entertainment, business events, and more.</p>
              </details>
              <details>
                <summary>
                  Can I build on Split?<span aria-hidden="true">+</span>
                </summary>
                <p>
                  The developer interfaces include a TypeScript SDK, REST API, WebSockets, and
                  webhooks. They share one data model and connect to the same protocol as the app.{" "}
                  <Link href="/docs?page=api-overview">Explore the developer docs ↗</Link>
                </p>
              </details>
              <details>
                <summary>
                  How is conviction scored?<span aria-hidden="true">+</span>
                </summary>
                <p>
                  At resolution, a Brier score compares your stated probability with the actual
                  outcome. That score contributes to your reputation, so the accuracy of your
                  confidence matters.
                </p>
              </details>
            </div>
          </section>
          <section className="closing-section">
            <div>
              <p className="eyebrow">THE FUTURE DOESN’T WAIT.</p>
              <h2>
                Your view of the future
                <br /> <em>is a market.</em>
              </h2>
              <p>Explore markets and put your conviction on-chain.</p>
              <Link className="button closing-button" href="/markets">
                Explore markets <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <div className="closing-art" aria-hidden="true"></div>
            <span className="closing-caption">POSSIBILITY, IN EVERY DIRECTION.</span>
          </section>
        </main>
        <footer className="site-footer">
          <div className="footer-top">
            <div className="footer-brand">
              <a className="brand" href="#" aria-label="Split home">
                <SplitLogo />
              </a>
              <p>On-chain markets for the future.</p>
            </div>
            <div className="footer-column">
              <h3>Product</h3>
              <Link href="/markets">Markets</Link>
              <Link href="/dashboard">Trading</Link>
              <Link href="/activity">Portfolio</Link>
              <a href="#how-it-works">How it works</a>
            </div>
            <div className="footer-column">
              <h3>Developers</h3>
              <Link href="/docs">Documentation</Link>
              <Link href="/docs?page=api-overview">API</Link>
              <Link href="/docs?page=sdk">SDK</Link>
            </div>
            <div className="footer-column">
              <h3>Company</h3>
              <a href="#insights">About</a>
            </div>
            <div className="footer-column">
              <h3>Follow</h3>
              <a href={siteConfig.x.href} target="_blank" rel="noopener noreferrer">
                X · {siteConfig.x.handle}
              </a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 Split</span>
            <a href="#">
              Back to the future <span aria-hidden="true">↑</span>
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}

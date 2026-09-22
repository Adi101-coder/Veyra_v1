import type { ReactNode } from "react";

/**
 * Architecture diagrams for the docs, drawn as inline SVG so they stay crisp at
 * any width, inherit the page's type, and match the landing palette.
 */

const C = {
  box: "#ffffff",
  stroke: "#dce5f1",
  text: "#182d4a",
  sub: "#536780",
  muted: "#65758b",
  grid: "#f1f6ff",
  green: "#1847d8",
  blue: "#265bff",
  amber: "#83a6e9",
  rose: "#ad4c62",
};

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function Box({
  x,
  y,
  w,
  h,
  title,
  lines = [],
  accent,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  lines?: string[];
  accent?: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} fill={C.box} stroke={accent ?? C.stroke} strokeOpacity={accent ? 0.55 : 1} />
      {accent ? <rect x={x} y={y + 14} width={2.5} height={h - 28} rx={1.25} fill={accent} /> : null}
      <text x={x + 16} y={y + 26} fill={C.text} fontSize={13.5} fontWeight={500}>
        {title}
      </text>
      {lines.map((line, i) => (
        <text key={line} x={x + 16} y={y + 47 + i * 17} fill={C.sub} fontSize={11} fontFamily={MONO}>
          {line}
        </text>
      ))}
    </g>
  );
}

function Arrow({ d, dashed, label, lx, ly }: { d: string; dashed?: boolean; label?: string; lx?: number; ly?: number }) {
  return (
    <g>
      <path d={d} fill="none" stroke={C.muted} strokeWidth={1.3} strokeDasharray={dashed ? "4 4" : undefined} markerEnd="url(#docs-arrow)" />
      {label ? (
        <text x={lx} y={ly} fill={C.muted} fontSize={10.5} fontFamily={MONO} textAnchor="middle">
          {label}
        </text>
      ) : null}
    </g>
  );
}

function Frame({ height, children, caption }: { height: number; children: ReactNode; caption: string }) {
  return (
    <figure className="mt-8 overflow-hidden rounded-2xl border border-[#dce5f1] bg-[#f8fbff]">
      <svg viewBox={`0 0 800 ${height}`} className="block h-auto w-full" fontFamily="inherit" role="img" aria-label={caption}>
        <defs>
          <marker id="docs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={C.muted} />
          </marker>
        </defs>
        {children}
      </svg>
      <figcaption className="border-t border-[#dce5f1] px-5 py-3 font-mono text-[11px] tracking-[0.06em] text-[#65758b]">
        {caption}
      </figcaption>
    </figure>
  );
}

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = Math.max(24, (x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
};

// --------------------------------------------------------------------------------

function SystemDiagram() {
  return (
    <Frame height={380} caption="fig. 1 — system architecture: a stated probability becomes a sized order, a venue fill, and a ledger entry">
      <Box x={20} y={150} w={120} h={80} title="Trader" lines={["wallet signature", "p = 0.72"]} />
      <Box x={185} y={110} w={180} h={160} title="Confidence engine" accent={C.blue} lines={["edge = p − q", "f* = (p−q)/(1−q)", "book age · spread", "integral ladder"]} />
      <Box x={410} y={60} w={170} h={90} title="Polymarket CLOB" lines={["external markets", "FAK · FOK · GTC"]} />
      <Box x={410} y={230} w={170} h={90} title="LMSR pool" accent={C.green} lines={["split-native", "max loss b·ln 2"]} />
      <Box x={625} y={30} w={155} h={62} title="Robinhood Chain" lines={["settlement refs"]} />
      <Box x={625} y={125} w={155} h={130} title="Fill ledger" accent={C.amber} lines={["PostgreSQL", "BigInt micros", "1 row / venue trade"]} />
      <Box x={625} y={290} w={155} h={62} title="Scoring" lines={["Brier · Conviction"]} />
      <Arrow d={curve(140, 190, 185, 190)} />
      <Arrow d={curve(365, 160, 410, 105)} />
      <Arrow d={curve(365, 220, 410, 275)} />
      <Arrow d={curve(580, 105, 625, 170)} label="fills" lx={604} ly={128} />
      <Arrow d={curve(580, 275, 625, 215)} label="fills" lx={604} ly={262} />
      <Arrow d="M 702 125 L 702 94" />
      <Arrow d="M 702 255 L 702 288" />
    </Frame>
  );
}

function LifecycleDiagram() {
  const steps = [
    ["Quote", "p vs book"],
    ["Guards", "age · spread"],
    ["Ladder", "integral price"],
    ["Submit", "FAK/FOK/GTC"],
    ["Reconcile", "venue trades"],
    ["Fill", "ledger write"],
  ];
  const w = 108;
  const gap = 20;
  const x = (i: number) => 20 + i * (w + gap);
  return (
    <Frame height={250} caption="fig. 2 — order lifecycle: a position moves only when step 6 records a venue fill">
      {steps.map(([title, sub], i) => (
        <g key={title}>
          <Box x={x(i)} y={40} w={w} h={70} title={title} lines={[sub]} accent={i === 5 ? C.amber : undefined} />
          {i < steps.length - 1 ? <Arrow d={`M ${x(i) + w} 75 L ${x(i + 1)} 75`} /> : null}
        </g>
      ))}
      <Arrow d={`M ${x(1) + w / 2} 110 L ${x(1) + w / 2} 158`} dashed />
      <Box x={x(0)} y={160} w={236} h={62} title="Declined" accent={C.rose} lines={["stale · wide · no edge"]} />
      <Arrow d={`M ${x(4) + w / 2} 110 L ${x(4) + w / 2} 158`} dashed />
      <Box x={x(3) + 20} y={160} w={236} h={62} title="Retry policy" lines={["only on 429 · 425 · 503"]} />
      <text x={x(5) + w / 2} y={132} fill={C.muted} fontSize={10.5} fontFamily={MONO} textAnchor="middle">
        once per trade id
      </text>
    </Frame>
  );
}

function LmsrDiagram() {
  const left = 70;
  const right = 470;
  const top = 30;
  const bottom = 250;
  const sx = (v: number) => left + ((v + 4) / 8) * (right - left);
  const sy = (v: number) => bottom - v * (bottom - top);
  const path = (scale: number) => {
    const points: string[] = [];
    for (let i = 0; i <= 160; i += 1) {
      const v = -4 + (i / 160) * 8;
      points.push(`${sx(v).toFixed(1)},${sy(1 / (1 + Math.exp(-v / scale))).toFixed(1)}`);
    }
    return `M ${points.join(" L ")}`;
  };
  return (
    <Frame height={300} caption="fig. 3 — LMSR price is a softmax of outstanding shares; b sets depth and caps the maker's loss at b·ln 2">
      {[0.25, 0.5, 0.75].map((v) => (
        <g key={v}>
          <line x1={left} x2={right} y1={sy(v)} y2={sy(v)} stroke={C.grid} />
          <text x={left - 10} y={sy(v) + 4} fill={C.muted} fontSize={10} fontFamily={MONO} textAnchor="end">
            {v.toFixed(2)}
          </text>
        </g>
      ))}
      <line x1={left} x2={right} y1={bottom} y2={bottom} stroke={C.stroke} />
      <line x1={left} x2={left} y1={top} y2={bottom} stroke={C.stroke} />
      <line x1={sx(0)} x2={sx(0)} y1={top} y2={bottom} stroke={C.grid} strokeDasharray="3 4" />
      <path d={path(2)} fill="none" stroke={C.blue} strokeWidth={1.6} strokeDasharray="5 4" />
      <path d={path(1)} fill="none" stroke={C.green} strokeWidth={2} />
      <circle cx={sx(0)} cy={sy(0.5)} r={4} fill={C.green} />
      <text x={(left + right) / 2} y={bottom + 28} fill={C.muted} fontSize={10.5} fontFamily={MONO} textAnchor="middle">
        (q_YES − q_NO) / b
      </text>
      <text x={left} y={top - 10} fill={C.muted} fontSize={10.5} fontFamily={MONO}>
        price_YES
      </text>
      <g>
        <line x1={505} x2={525} y1={48} y2={48} stroke={C.green} strokeWidth={2} />
        <text x={533} y={52} fill={C.sub} fontSize={11} fontFamily={MONO}>liquidity b</text>
        <line x1={505} x2={525} y1={70} y2={70} stroke={C.blue} strokeWidth={1.6} strokeDasharray="5 4" />
        <text x={533} y={74} fill={C.sub} fontSize={11} fontFamily={MONO}>liquidity 2b</text>
      </g>
      {["C(q) = b·ln Σ e^(q_i/b)", "p_YES = σ((q_Y − q_N)/b)", "Σ prices = 1", "max loss = b·ln 2", "deeper book ⇒ larger b"].map((line, i) => (
        <text key={line} x={505} y={120 + i * 24} fill={i === 3 ? C.green : C.text} fontSize={12} fontFamily={MONO}>
          {line}
        </text>
      ))}
    </Frame>
  );
}

function KellyDiagram() {
  const p = 0.7;
  const q = 0.55;
  const fStar = (p - q) / (1 - q);
  const g = (f: number) => p * Math.log(1 - f + f / q) + (1 - p) * Math.log(1 - f);
  const left = 70;
  const right = 470;
  const top = 30;
  const bottom = 250;
  const fMax = 0.8;
  const yMin = -0.14;
  const yMax = 0.06;
  const sx = (f: number) => left + (f / fMax) * (right - left);
  const sy = (v: number) => bottom - ((v - yMin) / (yMax - yMin)) * (bottom - top);
  const points: string[] = [];
  let zero = fMax;
  let prev = g(0);
  for (let i = 1; i <= 200; i += 1) {
    const f = (i / 200) * fMax;
    const v = g(f);
    if (prev > 0 && v <= 0 && f > fStar) zero = f;
    prev = v;
    points.push(`${sx(f).toFixed(1)},${sy(v).toFixed(1)}`);
  }
  const fraction = fStar * 0.25;
  return (
    <Frame height={300} caption="fig. 4 — expected log-growth vs stake: past ~2·f* over-betting turns growth negative, so Split stakes a fraction of f*">
      <rect x={sx(0)} y={top} width={sx(fraction) - sx(0)} height={bottom - top} fill={C.green} fillOpacity={0.07} />
      <line x1={left} x2={right} y1={sy(0)} y2={sy(0)} stroke={C.stroke} />
      <line x1={left} x2={left} y1={top} y2={bottom} stroke={C.stroke} />
      <path d={`M ${sx(0)},${sy(0)} L ${points.join(" L ")}`} fill="none" stroke={C.blue} strokeWidth={2} />
      <line x1={sx(fStar)} x2={sx(fStar)} y1={top} y2={bottom} stroke={C.blue} strokeDasharray="4 4" strokeOpacity={0.6} />
      <line x1={sx(zero)} x2={sx(zero)} y1={top} y2={bottom} stroke={C.rose} strokeDasharray="4 4" strokeOpacity={0.6} />
      <circle cx={sx(fStar)} cy={sy(g(fStar))} r={4} fill={C.blue} />
      <text x={sx(fStar) + 8} y={top + 14} fill={C.blue} fontSize={10.5} fontFamily={MONO}>f* = {(fStar * 100).toFixed(0)}%</text>
      <text x={sx(zero) + 8} y={top + 14} fill={C.rose} fontSize={10.5} fontFamily={MONO}>g &lt; 0</text>
      <text x={sx(fraction) / 2 + sx(0) / 2} y={bottom - 10} fill={C.green} fontSize={10} fontFamily={MONO} textAnchor="middle">¼·f*</text>
      <text x={(left + right) / 2} y={bottom + 28} fill={C.muted} fontSize={10.5} fontFamily={MONO} textAnchor="middle">fraction of bankroll staked</text>
      <text x={left} y={top - 10} fill={C.muted} fontSize={10.5} fontFamily={MONO}>E[log growth]</text>
      {[`p = ${p.toFixed(2)}   q = ${q.toFixed(2)}`, "f* = (p − q) / (1 − q)", "g(f) = p·ln(1 − f + f/q)", "     + (1 − p)·ln(1 − f)", "staked = f* × KELLY_FRACTION"].map((line, i) => (
        <text key={line} x={505} y={70 + i * 24} fill={C.text} fontSize={12} fontFamily={MONO}>
          {line}
        </text>
      ))}
    </Frame>
  );
}

function CustodyDiagram() {
  return (
    <Frame height={360} caption="fig. 5 — two-wallet custody: deposits sit in a watch-only treasury; only the trading wallet holds a server key">
      <Box x={20} y={140} w={135} h={78} title="User wallet" lines={["funds in / out"]} />
      <Box x={235} y={30} w={210} h={100} title="Treasury (X)" accent={C.green} lines={["user deposits", "watch-only", "no server key"]} />
      <Box x={235} y={235} w={210} h={100} title="Execution (Y)" accent={C.amber} lines={["omnibus trading wallet", "server-held key", "bounded by stake caps"]} />
      <Box x={530} y={30} w={250} h={100} title="Ledger" lines={["balance · holds · payouts", "append-only, unique per cause", "claims = Σbalance + Σholds"]} />
      <Box x={530} y={235} w={250} h={100} title="Polymarket CLOB" lines={["trades sized by Kelly", "fills reconciled to ledger"]} />
      <Arrow d={curve(155, 162, 235, 70)} label="deposit" lx={196} ly={104} />
      <Arrow d={curve(235, 100, 155, 196)} dashed label="withdraw · operator" lx={205} ly={240} />
      <Arrow d="M 340 235 L 340 132" dashed label="sweep Y → X" lx={392} ly={190} />
      <Arrow d="M 445 285 L 530 285" label="orders" lx={487} ly={278} />
      <Arrow d="M 530 300 L 447 300" label="fills" lx={487} ly={316} />
      <Arrow d="M 445 80 L 530 80" dashed label="tracked" lx={487} ly={73} />
    </Frame>
  );
}

function SolvencyDiagram() {
  const left = 200;
  const width = 560;
  const bar = (y: number, parts: [string, number, string][]) => {
    let at = left;
    return parts.map(([label, share, color]) => {
      const w = share * width;
      const x = at;
      at += w;
      return (
        <g key={label}>
          <rect x={x} y={y} width={w - 2} height={38} rx={6} fill={color} fillOpacity={0.18} stroke={color} strokeOpacity={0.6} />
          <text x={x + 10} y={y + 24} fill={C.text} fontSize={11} fontFamily={MONO}>
            {label}
          </text>
        </g>
      );
    });
  };
  return (
    <Frame height={250} caption="fig. 6 — the solvency invariant: every claim must be backed by USDC read from chain, not typed into config">
      <text x={20} y={78} fill={C.text} fontSize={13}>Claims</text>
      <text x={20} y={96} fill={C.muted} fontSize={10.5} fontFamily={MONO}>from the ledger</text>
      {bar(58, [["balances", 0.5, C.green], ["holds", 0.2, C.blue], ["house", 0.14, C.amber]])}
      <text x={20} y={166} fill={C.text} fontSize={13}>Controlled</text>
      <text x={20} y={184} fill={C.muted} fontSize={10.5} fontFamily={MONO}>read on-chain</text>
      {bar(146, [["omnibus (Y)", 0.58, C.sub], ["treasury (X)", 0.34, C.sub]])}
      <text x={left + 0.84 * width + 14} y={126} fill={C.green} fontSize={20} fontFamily={MONO}>≤</text>
      <text x={left} y={226} fill={C.muted} fontSize={11} fontFamily={MONO}>INSOLVENT ⇔ claims + house &gt; controlled   ·   report-only, never auto-corrected</text>
    </Frame>
  );
}

function VotingDiagram() {
  const steps: [string, string[], string | undefined][] = [
    ["OPEN", ["24h round", "3 votes / wallet"], C.blue],
    ["CLOSED", ["tally frozen", "rank stored"], undefined],
    ["FINALIZED", ["top 5 selected", "ties → earliest"], undefined],
    ["POOLS LIVE", ["LMSR opened", "b·ln 2 reserved"], C.green],
  ];
  const w = 160;
  const gap = 40;
  const x = (i: number) => 20 + i * (w + gap);
  return (
    <Frame height={250} caption="fig. 7 — the daily round: one open round at a time, enforced by a partial unique index">
      {steps.map(([title, lines, accent], i) => (
        <g key={title}>
          <Box x={x(i)} y={40} w={w} h={92} title={title} lines={lines} accent={accent} />
          {i < steps.length - 1 ? <Arrow d={`M ${x(i) + w} 86 L ${x(i + 1)} 86`} /> : null}
        </g>
      ))}
      <Arrow d={`M ${x(3) + w / 2} 132 C ${x(3) + w / 2} 215, ${x(0) + w / 2} 215, ${x(0) + w / 2} 134`} dashed label="next round opens" lx={400} ly={206} />
    </Frame>
  );
}

function MatchingDiagram() {
  return (
    <Frame height={340} caption="fig. 8 — hybrid matching: orders are matched off-chain and settled atomically on-chain against both signatures">
      <Box x={20} y={40} w={150} h={78} title="Maker" lines={["signs EIP-712 order"]} />
      <Box x={20} y={210} w={150} h={78} title="Taker" lines={["signs EIP-712 order"]} />
      <Box x={235} y={115} w={185} h={100} title="Matching operator" lines={["off-chain book", "pairs crossing orders", "cannot alter a price"]} />
      <Box x={495} y={40} w={285} h={150} title="Settlement contract" accent={C.blue} lines={["ecrecover(sigA) = a.maker", "ecrecover(sigB) = b.maker", "price crosses · unexpired", "filled[hash] + x ≤ size", "atomic swap"]} />
      <Box x={495} y={230} w={285} h={70} title="Outcome tokens ↔ collateral" lines={["1 YES + 1 NO = 1 USDC"]} accent={C.green} />
      <Arrow d={curve(170, 79, 235, 150)} />
      <Arrow d={curve(170, 249, 235, 180)} />
      <Arrow d={curve(420, 165, 495, 115)} label="settle()" lx={457} ly={132} />
      <Arrow d="M 637 190 L 637 228" />
    </Frame>
  );
}

const diagrams = {
  system: SystemDiagram,
  lifecycle: LifecycleDiagram,
  lmsr: LmsrDiagram,
  kelly: KellyDiagram,
  custody: CustodyDiagram,
  solvency: SolvencyDiagram,
  voting: VotingDiagram,
  matching: MatchingDiagram,
} as const;

export type DiagramName = keyof typeof diagrams;

export function Diagram({ name }: { name: string }) {
  const Component = diagrams[name as DiagramName];
  return Component ? <Component /> : null;
}

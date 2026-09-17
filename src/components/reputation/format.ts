// Display-only formatting. All metrics are computed server-side.

const DASH = "—";

export function pct(ratio: number | null | undefined, digits = 1) {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return DASH;
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function pctValue(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return `${value.toFixed(digits)}%`;
}

/** "0.160000" -> "0.160" (truncated, not rounded). */
export function brier(value: string | null | undefined) {
  if (!value) return DASH;
  const [whole, frac = ""] = value.split(".");
  return `${whole}.${frac.padEnd(3, "0").slice(0, 3)}`;
}

/** Ratio string like "0.123400" -> "+12.3%". */
export function roi(value: string | null | undefined) {
  if (value === null || value === undefined) return DASH;
  const n = Number(value);
  if (!Number.isFinite(n)) return DASH;
  const p = (n * 100).toFixed(1);
  if (Number(p) === 0) return "0.0%";
  return n > 0 ? `+${p}%` : `−${p.replace("-", "")}%`;
}

/** Signed USD string like "-1.23" -> "−$1.23". */
export function usd(value: string | null | undefined, signed = false) {
  if (value === null || value === undefined || value === "") return DASH;
  const negative = value.startsWith("-");
  const abs = negative ? value.slice(1) : value;
  if (negative) return `−$${abs}`;
  return signed && Number(abs) !== 0 ? `+$${abs}` : `$${abs}`;
}

export function humanStatus(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

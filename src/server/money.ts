/** Integer money helpers. Do not use IEEE floats for stake, shares, or notional. */

export const USDC_DECIMALS = 6;
export const SHARE_DECIMALS = 6;
export const PRICE_DECIMALS = 4;
export const USDC_SCALE = 1_000_000n;
export const SHARE_SCALE = 1_000_000n;
export const PRICE_BPS_SCALE = 10_000;
export const MAX_PRICE_BPS = 10_000;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

function scaleFromDecimals(decimals: number) {
  return 10n ** BigInt(decimals);
}

export function parseDecimalToScale(
  value: string,
  decimals: number,
  mode: "reject" | "floor" = "reject",
): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new MoneyError(`Invalid decimal: ${value}`);
  }
  const [wholeRaw, fracRaw = ""] = trimmed.split(".");
  if (fracRaw.length > decimals) {
    if (mode === "reject") {
      throw new MoneyError(
        `Too many decimal places (max ${decimals}): ${value}`,
      );
    }
  }
  const frac = (fracRaw + "0".repeat(decimals)).slice(0, decimals);
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  const amount = BigInt(whole) * scaleFromDecimals(decimals) + BigInt(frac || "0");
  return amount;
}

export function parseUsdMicros(value: string, mode: "reject" | "floor" = "reject") {
  return parseDecimalToScale(value, USDC_DECIMALS, mode);
}

export function parseSharesMicros(value: string, mode: "reject" | "floor" = "reject") {
  return parseDecimalToScale(value, SHARE_DECIMALS, mode);
}

export function parsePriceBps(value: string, mode: "reject" | "floor" = "floor") {
  const ticks = parseDecimalToScale(value, PRICE_DECIMALS, mode);
  if (ticks < 0n || ticks > BigInt(MAX_PRICE_BPS)) {
    throw new MoneyError(`Price out of range: ${value}`);
  }
  return Number(ticks);
}

export function formatScale(amount: bigint, decimals: number, displayDecimals = decimals) {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const scale = scaleFromDecimals(decimals);
  const whole = abs / scale;
  const frac = abs % scale;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, displayDecimals);
  const sign = negative ? "-" : "";
  if (displayDecimals === 0) return `${sign}${whole.toString()}`;
  return `${sign}${whole.toString()}.${fracStr}`;
}

export function formatUsd(micros: bigint, displayDecimals = 2) {
  return formatScale(micros, USDC_DECIMALS, displayDecimals);
}

export function formatShares(micros: bigint, displayDecimals = 2) {
  return formatScale(micros, SHARE_DECIMALS, displayDecimals);
}

export function formatPrice(bps: number) {
  if (!Number.isInteger(bps) || bps < 0 || bps > MAX_PRICE_BPS) {
    throw new MoneyError(`Invalid price bps: ${bps}`);
  }
  return formatScale(BigInt(bps), PRICE_DECIMALS, PRICE_DECIMALS);
}

export function mulDiv(a: bigint, b: bigint, denominator: bigint) {
  if (denominator === 0n) throw new MoneyError("Division by zero");
  return (a * b) / denominator;
}

export function floorToLot(amount: bigint, lot: bigint) {
  if (lot <= 0n) throw new MoneyError("Lot must be positive");
  return amount - (amount % lot);
}

export function sharesCostMicros(sharesMicros: bigint, priceBps: number) {
  if (priceBps < 0 || priceBps > MAX_PRICE_BPS) {
    throw new MoneyError(`Invalid price bps: ${priceBps}`);
  }
  return mulDiv(sharesMicros, BigInt(priceBps), BigInt(PRICE_BPS_SCALE));
}

export function sharesFromNotional(notionalMicros: bigint, priceBps: number, lot: bigint) {
  if (priceBps <= 0) throw new MoneyError("Price must be positive");
  const raw = mulDiv(notionalMicros, BigInt(PRICE_BPS_SCALE), BigInt(priceBps));
  return floorToLot(raw, lot);
}

export function confidencePctToBps(pct: number) {
  if (!Number.isFinite(pct)) throw new MoneyError("Invalid confidence");
  return Math.round(pct * 100);
}

export function bpsToPct(bps: number) {
  return bps / 100;
}

export function tickBpsFromSize(tickSize: string) {
  const bps = parsePriceBps(tickSize, "floor");
  return bps > 0 ? bps : 100;
}

export function floorToTick(priceBps: number, tickBps: number) {
  if (tickBps <= 0) return priceBps;
  return Math.floor(priceBps / tickBps) * tickBps;
}

export function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

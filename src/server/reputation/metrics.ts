/**
 * Prediction reputation metrics.
 *
 * There is no composite "reputation score". These are standard forecast-evaluation
 * statistics. Lower Brier and lower ECE are better; accuracy and ROI are descriptive.
 *
 * Brier score (binary proper scoring rule):
 *   impliedYes = confidence if the user picked YES, else 1 - confidence
 *   y = 1 if the market resolved YES, else 0
 *   brier = (impliedYes - y)^2
 *   Reported value is the mean over resolved predictions. Range [0, 1].
 *   A calibrated 50% forecast scores 0.25; a perfect forecast scores 0.
 *
 * Accuracy:
 *   correct / resolved, where correct means predictedOutcome === resolvedOutcome.
 *   This ignores how extreme the confidence was. Use Brier for that.
 *
 * Average confidence:
 *   Mean stated confidence (0-100) at resolution time, over resolved predictions.
 *   Change-your-mind updates are included; the live prediction.confidence is used.
 *
 * Calibration (Expected Calibration Error):
 *   Stated confidence is bucketed into 10 equal bins [0,10), …, [90,100].
 *   For each bin: empiricalAccuracy = correct / n, predicted = mean confidence.
 *   ECE = Σ (n_i / N) * |empiricalAccuracy_i - predicted_i|
 *   ECE = 0 means that when the user says ~p, they are right about p of the time.
 *
 * ROI:
 *   sum(pnl) / sum(notional) over resolved predictions that actually filled.
 *   notional = USDC spent on filled BUYs; proceeds = USDC received from filled SELLs.
 *   pnl = (held shares x $1 if correct, else 0) + proceeds - notional.
 *   Only venue/paper fills count; unfilled or failed orders are never scored.
 */

export const BRIER_SCALE = 1_000_000n;
export const BPS = 10_000;
export const BIN_COUNT = 10;
export const BIN_WIDTH_BPS = 1_000;

export const REPUTATION_DOCUMENTATION = {
  brierScore:
    "Mean (implied P(YES) − realized YES)². implied P(YES) is the stated confidence when the pick is YES, otherwise 1 − confidence. Proper scoring rule; 0 is perfect.",
  accuracy:
    "Share of resolved predictions whose picked outcome matched the market outcome. Does not weight confidence.",
  averageConfidence:
    "Mean stated confidence at resolution, in percent. Uses the live prediction confidence (after any change-your-mind).",
  calibrationEce:
    "Expected Calibration Error over 10 confidence bins: weighted mean of |empirical accuracy − mean stated confidence|.",
  roi: "sum(pnl) / sum(filled cost). pnl = winning shares × $1 + sell proceeds − filled cost. Not annualized.",
};

export function impliedYesBps(predictedOutcome: "YES" | "NO", confidenceBps: number) {
  const clamped = Math.min(BPS, Math.max(0, confidenceBps));
  return predictedOutcome === "YES" ? clamped : BPS - clamped;
}

export function brierMicros(impliedYes: number, resolvedOutcome: "YES" | "NO") {
  const y = resolvedOutcome === "YES" ? BPS : 0;
  const diff = BigInt(impliedYes - y);
  return (diff * diff) / 100n;
}

export function formatBrier(micros: bigint) {
  const whole = micros / BRIER_SCALE;
  const frac = (micros % BRIER_SCALE).toString().padStart(6, "0");
  return `${whole.toString()}.${frac}`;
}

export function confidenceBinIndex(confidenceBps: number) {
  if (confidenceBps >= BPS) return BIN_COUNT - 1;
  if (confidenceBps <= 0) return 0;
  return Math.min(BIN_COUNT - 1, Math.floor(confidenceBps / BIN_WIDTH_BPS));
}

export function binRange(index: number) {
  const start = index * 10;
  const end = index === BIN_COUNT - 1 ? 100 : start + 10;
  return { minPct: start, maxPct: end };
}

export function pnlMicros(correct: boolean, notionalMicros: bigint, payoutMicros: bigint) {
  if (notionalMicros <= 0n) return 0n;
  return correct ? payoutMicros - notionalMicros : -notionalMicros;
}

export function ratio(numerator: bigint, denominator: bigint) {
  if (denominator === 0n) return null;
  const scaled = (numerator * 1_000_000n) / denominator;
  const whole = scaled / 1_000_000n;
  const frac = (scaled % 1_000_000n < 0n ? -(scaled % 1_000_000n) : scaled % 1_000_000n)
    .toString()
    .padStart(6, "0");
  const sign = scaled < 0n && whole === 0n ? "-" : "";
  return `${sign}${whole.toString()}.${frac}`;
}

export function meanBrier(sumMicros: bigint, count: number) {
  if (count <= 0) return null;
  return formatBrier(sumMicros / BigInt(count));
}

export function accuracyRatio(correct: number, resolved: number) {
  if (resolved <= 0) return null;
  return correct / resolved;
}

export function averageConfidencePct(sumBps: bigint, count: number) {
  if (count <= 0) return null;
  return Number(sumBps) / count / 100;
}

export type CalibrationBinInput = {
  binIndex: number;
  sampleCount: number;
  sumConfidenceBps: bigint;
  correctCount: number;
};

export function expectedCalibrationError(bins: CalibrationBinInput[], resolvedCount: number) {
  if (resolvedCount <= 0) return null;
  let acc = 0;
  for (const bin of bins) {
    if (bin.sampleCount <= 0) continue;
    const empirical = bin.correctCount / bin.sampleCount;
    const predicted = Number(bin.sumConfidenceBps) / bin.sampleCount / BPS;
    acc += (bin.sampleCount / resolvedCount) * Math.abs(empirical - predicted);
  }
  return acc;
}

export function scoreForecast(input: {
  predictedOutcome: "YES" | "NO";
  resolvedOutcome: "YES" | "NO";
  confidenceBps: number;
  notionalMicros: bigint;
  payoutMicros: bigint;
  proceedsMicros?: bigint;
}) {
  const implied = impliedYesBps(input.predictedOutcome, input.confidenceBps);
  const correct = input.predictedOutcome === input.resolvedOutcome;
  const brier = brierMicros(implied, input.resolvedOutcome);
  const pnl = pnlMicros(correct, input.notionalMicros, input.payoutMicros) + (input.proceedsMicros ?? 0n);
  return {
    impliedYesBps: implied,
    correct,
    brierMicros: brier,
    pnlMicros: pnl,
    binIndex: confidenceBinIndex(input.confidenceBps),
  };
}

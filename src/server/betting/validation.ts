import type { ChangeConfidenceRequest, Outcome, PlacePredictionRequest, QuoteRequest } from "@/lib/betting";
import { BettingError } from "@/server/errors";
import { parseUsdMicros } from "@/server/money";

const EVM = /^0x[a-fA-F0-9]{40}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function parseOutcome(value: unknown): Outcome {
  if (value === "YES" || value === "NO") return value;
  if (typeof value === "string") {
    const upper = value.trim().toUpperCase();
    if (upper === "YES" || upper === "NO") return upper;
  }
  throw new BettingError("INVALID_OUTCOME", "Outcome must be YES or NO.");
}

export function parseConfidencePct(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new BettingError("INVALID_CONFIDENCE", "Confidence must be a number.");
  }
  if (n < 0 || n > 100) {
    throw new BettingError("INVALID_CONFIDENCE", "Confidence must be between 0 and 100.");
  }
  return n;
}

export function parseStakeUsd(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new BettingError("INVALID_STAKE", "Stake must be a decimal string.");
  }
  const raw = typeof value === "number" ? value.toFixed(6) : value.trim();
  try {
    const micros = parseUsdMicros(raw, "reject");
    if (micros <= 0n) throw new BettingError("INVALID_STAKE", "Stake must be greater than 0.");
    return { stakeUsd: raw, stakeMicros: micros };
  } catch (error) {
    if (error instanceof BettingError) throw error;
    throw new BettingError("INVALID_STAKE", error instanceof Error ? error.message : "Invalid stake.");
  }
}

export function parseWalletAddress(value: unknown) {
  if (typeof value !== "string") {
    throw new BettingError("INVALID_WALLET", "Wallet address is required.");
  }
  const address = value.trim();
  if (EVM.test(address) || SOLANA.test(address)) return address;
  throw new BettingError("INVALID_WALLET", "Wallet address is not a valid EVM or Solana address.");
}

export function parseMarketId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BettingError("INVALID_MARKET", "Market id is required.");
  }
  const id = value.trim();
  if (id.length > 180) {
    throw new BettingError("INVALID_MARKET", "Market id is too long.");
  }
  return id;
}

export function parseIdempotencyKey(value: unknown) {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new BettingError("INVALID_IDEMPOTENCY_KEY", "Idempotency key must be a string.");
  }
  const key = value.trim();
  if (key.length < 8 || key.length > 128) {
    throw new BettingError(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency key must be 8 to 128 characters.",
    );
  }
  return key;
}

export function parseQuoteRequest(body: unknown): QuoteRequest {
  if (!body || typeof body !== "object") {
    throw new BettingError("INVALID_BODY", "JSON body is required.");
  }
  const raw = body as Record<string, unknown>;
  const stake = parseStakeUsd(raw.stakeUsd);
  return {
    marketId: parseMarketId(raw.marketId),
    outcome: parseOutcome(raw.outcome),
    confidencePct: parseConfidencePct(raw.confidencePct),
    stakeUsd: stake.stakeUsd,
  };
}

export function parseChangeConfidenceRequest(
  body: unknown,
  headerKey?: string | null,
): ChangeConfidenceRequest {
  if (!body || typeof body !== "object") {
    throw new BettingError("INVALID_BODY", "JSON body is required.");
  }
  const raw = body as Record<string, unknown>;
  let quotedMarketPrice: string | undefined;
  if (raw.quotedMarketPrice != null && raw.quotedMarketPrice !== "") {
    if (typeof raw.quotedMarketPrice !== "string" && typeof raw.quotedMarketPrice !== "number") {
      throw new BettingError("INVALID_PRICE", "quotedMarketPrice must be a decimal string.");
    }
    quotedMarketPrice =
      typeof raw.quotedMarketPrice === "number"
        ? raw.quotedMarketPrice.toFixed(4)
        : raw.quotedMarketPrice.trim();
  }
  return {
    confidencePct: parseConfidencePct(raw.confidencePct),
    walletAddress: parseWalletAddress(raw.walletAddress),
    idempotencyKey: parseIdempotencyKey(headerKey || raw.idempotencyKey),
    quotedMarketPrice,
    expectedConfidencePct:
      raw.expectedConfidencePct == null ? undefined : parseConfidencePct(raw.expectedConfidencePct),
  };
}

export function parsePlaceRequest(body: unknown, headerKey?: string | null): PlacePredictionRequest {
  const quote = parseQuoteRequest(body);
  const raw = body as Record<string, unknown>;
  return {
    ...quote,
    walletAddress: parseWalletAddress(raw.walletAddress),
    idempotencyKey: parseIdempotencyKey(headerKey || raw.idempotencyKey),
  };
}

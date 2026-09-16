import type {
  ChangeConfidenceRequest,
  ConfidenceHistoryDTO,
  EngineQuote,
  PlacePredictionRequest,
  PredictionDTO,
  QuoteRequest,
} from "@/lib/betting";
import type { MarketConviction } from "@/lib/conviction";

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json()) as T & {
    error?: { code?: string; message?: string } | string;
  };
  if (!response.ok) {
    const message =
      typeof json.error === "string"
        ? json.error
        : json.error?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return json;
}

export async function quotePrediction(input: QuoteRequest) {
  const response = await fetch("/api/predictions/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await readJson<{ quote: EngineQuote }>(response);
  return json.quote;
}

export async function placePrediction(input: PlacePredictionRequest, idempotencyKey?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  const response = await fetch("/api/predictions", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...input, idempotencyKey }),
  });
  const json = await readJson<{ prediction: PredictionDTO }>(response);
  return json.prediction;
}

export async function listPredictions(marketId: string, walletAddress?: string) {
  const params = new URLSearchParams({ marketId });
  if (walletAddress) params.set("walletAddress", walletAddress);
  const response = await fetch(`/api/predictions?${params.toString()}`, { cache: "no-store" });
  const json = await readJson<{ predictions: PredictionDTO[] }>(response);
  return json.predictions;
}

export async function getPrediction(id: string) {
  const response = await fetch(`/api/predictions/${id}`, { cache: "no-store" });
  const json = await readJson<{ prediction: PredictionDTO }>(response);
  return json.prediction;
}

export async function changeConfidence(id: string, input: ChangeConfidenceRequest, idempotencyKey?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  const response = await fetch(`/api/predictions/${id}/confidence`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ ...input, idempotencyKey }),
  });
  const json = await readJson<{ prediction: PredictionDTO; history: ConfidenceHistoryDTO }>(response);
  return json;
}

export async function listConfidenceHistory(id: string) {
  const response = await fetch(`/api/predictions/${id}/confidence-history`, { cache: "no-store" });
  const json = await readJson<{ history: ConfidenceHistoryDTO[] }>(response);
  return json.history;
}

export async function getUserReputation(walletAddress: string) {
  const response = await fetch(`/api/users/${encodeURIComponent(walletAddress)}/reputation`, {
    cache: "no-store",
  });
  return readJson<{ reputation: unknown }>(response);
}

export async function listUserPredictions(walletAddress: string) {
  const response = await fetch(`/api/users/${encodeURIComponent(walletAddress)}/predictions`, {
    cache: "no-store",
  });
  return readJson<{ predictions: PredictionDTO[] }>(response);
}

export async function getMarketConviction(marketId: string) {
  const response = await fetch(`/api/markets/${encodeURIComponent(marketId)}/conviction`, {
    cache: "no-store",
  });
  return readJson<MarketConviction>(response);
}

import type {
  ChangeConfidenceRequest,
  ConfidenceHistoryDTO,
  EngineQuote,
  PlacePredictionRequest,
  PredictionDTO,
  QuoteRequest,
} from "@/lib/betting";
import type { MarketConviction } from "@/lib/conviction";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as T & {
    error?: { code?: string; message?: string } | string;
  };
  if (!response.ok) {
    const message =
      typeof json.error === "string"
        ? json.error
        : json.error?.message || `Request failed (${response.status})`;
    const code = typeof json.error === "object" && json.error?.code ? json.error.code : `HTTP_${response.status}`;
    throw new ApiError(message, code, response.status);
  }
  return json;
}

/**
 * Registered by WalletProvider: proves wallet control (signed nonce) and returns
 * once the HttpOnly session cookie is set. Writes call it on 401 and retry once
 * with the same idempotency key, so a retry can never create a second order.
 */
type SessionEnsurer = () => Promise<void>;
let ensureSession: SessionEnsurer | null = null;

export function registerSessionEnsurer(fn: SessionEnsurer | null) {
  ensureSession = fn;
}

async function authedWrite<T>(url: string, init: RequestInit): Promise<T> {
  const send = () => fetch(url, { ...init, credentials: "same-origin" });
  let response = await send();
  if (response.status === 401 && ensureSession) {
    await ensureSession();
    response = await send();
  }
  return readJson<T>(response);
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

export async function placePrediction(input: PlacePredictionRequest, idempotencyKey: string) {
  const json = await authedWrite<{ prediction: PredictionDTO }>("/api/predictions", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify({ ...input, idempotencyKey }),
  });
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
  const response = await fetch(`/api/predictions/${encodeURIComponent(id)}`, { cache: "no-store" });
  const json = await readJson<{ prediction: PredictionDTO }>(response);
  return json.prediction;
}

export async function changeConfidence(id: string, input: ChangeConfidenceRequest, idempotencyKey: string) {
  return authedWrite<{ prediction: PredictionDTO; history: ConfidenceHistoryDTO }>(
    `/api/predictions/${encodeURIComponent(id)}/confidence`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify({ ...input, idempotencyKey }),
    },
  );
}

/** Asks the server to reconcile an execution against Polymarket (owner only). */
export async function syncExecution(executionId: string) {
  const json = await authedWrite<{ prediction: PredictionDTO }>(
    `/api/executions/${encodeURIComponent(executionId)}/sync`,
    { method: "POST", headers: { "content-type": "application/json" } },
  );
  return json.prediction;
}

export async function listConfidenceHistory(id: string) {
  const response = await fetch(`/api/predictions/${encodeURIComponent(id)}/confidence-history`, { cache: "no-store" });
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

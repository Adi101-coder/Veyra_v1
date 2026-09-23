import type {
  ChangeConfidenceRequest,
  ConfidenceHistoryDTO,
  EngineQuote,
  Outcome,
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

/** Parses an API response; a non-JSON body (e.g. a host error page) becomes a clear error. */
async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(
      response.ok
        ? "The server returned an unexpected response. Please try again."
        : `The server is unavailable right now (HTTP ${response.status}). Please try again shortly.`,
      `HTTP_${response.status}`,
      response.status || 502,
    );
  }
  const json = parsed as T & {
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

/** Asks the connected wallet for the one-time sign-in signature. No gas. */
export async function requestWalletSignIn() {
  if (!ensureSession) {
    throw new Error("Connect a wallet first.");
  }
  await ensureSession();
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

/** Sells all of the position, or part of it by percent or share count. Confidence is unchanged. */
export async function closePosition(
  id: string,
  idempotencyKey: string,
  amount: { percent?: number; shares?: string } = {},
) {
  return authedWrite<{ prediction: PredictionDTO; history: ConfidenceHistoryDTO }>(
    `/api/predictions/${encodeURIComponent(id)}/close`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify({ ...amount, idempotencyKey }),
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

/** Best bid for an outcome: what one share sells for right now, or null with no bids. */
export async function getBestBid(marketId: string, outcome: Outcome) {
  const response = await fetch(
    `/api/markets/${encodeURIComponent(marketId)}/book?outcome=${outcome}`,
    { cache: "no-store" },
  );
  const json = await readJson<{ book: { bids: { price: string }[] } }>(response);
  const prices = json.book.bids.map((level) => Number(level.price)).filter(Number.isFinite);
  return prices.length ? Math.max(...prices) : null;
}

export async function getMarketConviction(marketId: string) {
  const response = await fetch(`/api/markets/${encodeURIComponent(marketId)}/conviction`, {
    cache: "no-store",
  });
  return readJson<MarketConviction>(response);
}

// --- Daily voting -----------------------------------------------------------

export type VotingProposal = {
  id: string;
  title: string;
  category: string;
  tag: string;
  resolvesAt: string | null;
  proposerWallet: string;
  voteCount: number;
  rank: number | null;
  createdAt: string;
};

export type VotingRound = {
  round: {
    id: string;
    status: string;
    opensAt: string;
    closesAt: string;
    selectionCount: number;
    votesPerWallet: number;
  } | null;
  proposals: VotingProposal[];
  myVotes: string[];
  votesRemaining: number | null;
};

export async function getVotingRound() {
  const response = await fetch("/api/voting/round", { cache: "no-store", credentials: "same-origin" });
  return readJson<VotingRound>(response);
}

export async function proposeQuestion(input: { title: string; category?: string; tag?: string; resolvesAt?: string }) {
  const json = await authedWrite<{ proposal: { id: string } }>("/api/voting/proposals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return json.proposal;
}

/** Voting twice for the same proposal is a no-op: `recorded` comes back false. */
export async function castVote(proposalId: string) {
  return authedWrite<{ recorded: boolean; votesUsed: number; votesRemaining: number }>("/api/voting/votes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ proposalId }),
  });
}

export type RoundHistory = {
  round: { id: string; status: string; closesAt: string; finalizedAt: string | null; selectionCount: number };
  results: { rank: number; proposalId: string; title: string; voteCount: number; selected: boolean; marketId: string | null }[];
};

export async function getRoundHistory(roundId: string) {
  const response = await fetch(`/api/voting/rounds/${encodeURIComponent(roundId)}`, { cache: "no-store" });
  return readJson<RoundHistory>(response);
}

export async function listRounds() {
  const response = await fetch("/api/voting/rounds", { cache: "no-store" });
  return readJson<{ rounds: { id: string; status: string; opensAt: string; closesAt: string; finalizedAt: string | null }[] }>(response);
}

// --- Treasury ---------------------------------------------------------------

export type TreasuryBalance = { asset: string; balanceBase: string; decimals: number };

export type DepositAsset = {
  symbol: string;
  contract: string;
  chainId: number;
  decimals: number;
  /** The asset a balance can actually be bet with. */
  isCashAsset: boolean;
};

export type DepositInfo = {
  treasuryAddress: string | null;
  cashAsset: string;
  assets: DepositAsset[];
  acceptsDeposits: boolean;
};

export async function getDepositInfo() {
  const response = await fetch("/api/treasury/deposit-info", { cache: "no-store", credentials: "same-origin" });
  return readJson<DepositInfo>(response);
}

export async function getTreasuryBalances() {
  const response = await fetch("/api/treasury/balances", { cache: "no-store", credentials: "same-origin" });
  return readJson<{ walletAddress: string; balances: TreasuryBalance[] }>(response);
}

export type TreasuryExposure = {
  walletAddress: string;
  positions: {
    predictionId: string;
    marketId: string;
    outcome: string;
    status: string;
    sharesMicros: string;
    notionalMicros: string;
  }[];
  totalNotionalMicros: string;
};

export async function getTreasuryExposure() {
  const response = await fetch("/api/treasury/exposure", { cache: "no-store", credentials: "same-origin" });
  return readJson<TreasuryExposure>(response);
}

export type PoolSummary = {
  id: string;
  title: string;
  category: string;
  tag: string;
  funded: boolean;
  yesPriceBps: number | null;
  feeBps: number | null;
  proposerWallet: string | null;
};

export type TreasuryWithdrawal = {
  id: string;
  status: string;
  amountMicros: string;
  destAddress: string;
  txHash: string | null;
  errorMessage: string | null;
  /** True once automatic payout refused the row and an operator has to send it. */
  manualOnly: boolean;
  createdAt: string;
};

export async function requestWithdrawal(input: { destAddress: string; amountMicros: string }) {
  return authedWrite<{ id: string; status: string; amountMicros: string; destAddress: string }>(
    "/api/treasury/withdrawals",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function listWithdrawals() {
  const response = await fetch("/api/treasury/withdrawals", { cache: "no-store", credentials: "same-origin" });
  return readJson<{ withdrawals: TreasuryWithdrawal[] }>(response);
}

export async function listPools() {
  const response = await fetch("/api/pools", { cache: "no-store" });
  return readJson<{ pools: PoolSummary[] }>(response);
}

// --- Live Polymarket tape ---------------------------------------------------

export type { LiveTrade, VenueHolder, VenueTraderPosition } from "@/lib/polymarket";

export async function getLiveTrades(query?: { limit?: number; marketId?: string; walletAddress?: string }) {
  const params = new URLSearchParams();
  if (query?.limit) params.set("limit", String(query.limit));
  if (query?.marketId) params.set("marketId", query.marketId);
  if (query?.walletAddress) params.set("walletAddress", query.walletAddress);
  const suffix = params.size ? `?${params}` : "";
  const response = await fetch(`/api/trades${suffix}`, { cache: "no-store" });
  return readJson<{ source: string; trades: import("@/lib/polymarket").LiveTrade[]; error?: string }>(response);
}

export async function getVenuePositions(walletAddress: string) {
  const response = await fetch(
    `/api/polymarket/positions?walletAddress=${encodeURIComponent(walletAddress)}`,
    { cache: "no-store" },
  );
  return readJson<{
    source: string;
    walletAddress: string;
    positions: import("@/lib/polymarket").VenueTraderPosition[];
    error?: string;
  }>(response);
}

export async function getMarketHolders(marketId: string) {
  const response = await fetch(`/api/markets/${encodeURIComponent(marketId)}/holders`, { cache: "no-store" });
  return readJson<{ source: string; holders: import("@/lib/polymarket").VenueHolder[]; error?: string }>(response);
}

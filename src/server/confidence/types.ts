import type { ConfidenceEngineConfig } from "@/server/confidence/config";
import type { Outcome, OrderBookSnapshot } from "@/lib/betting";

export type EngineBookLevel = {
  priceBps: number;
  sizeMicros: bigint;
};

export type EngineBook = {
  tokenId: string;
  tickBps: number;
  minSharesMicros: bigint;
  negRisk: boolean;
  source: OrderBookSnapshot["source"];
  hash?: string;
  timestamp?: string;
  asks: EngineBookLevel[];
  bids: EngineBookLevel[];
};

export type EngineInput = {
  outcome: Outcome;
  confidenceBps: number;
  stakeMicros: bigint;
  book: EngineBook;
};

export type EngineWalkFill = {
  priceBps: number;
  sharesMicros: bigint;
  notionalMicros: bigint;
};

export type EngineResult = {
  accepted: true;
  version: string;
  outcome: Outcome;
  side: "BUY";
  tokenId: string;
  confidenceBps: number;
  marketPriceBps: number;
  bestAskBps: number;
  edgeBps: number;
  kellyBps: number;
  sizedKellyBps: number;
  limitPriceBps: number;
  avgPriceBps: number;
  sharesMicros: bigint;
  notionalMicros: bigint;
  payoutMicros: bigint;
  tickBps: number;
  minSharesMicros: bigint;
  fills: EngineWalkFill[];
  config: ConfidenceEngineConfig;
};

export type EngineRejection = {
  accepted: false;
  version: string;
  code: string;
  message: string;
};

export type EngineOutput = EngineResult | EngineRejection;

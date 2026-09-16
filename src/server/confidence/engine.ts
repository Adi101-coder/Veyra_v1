import type { ConfidenceEngineConfig } from "@/server/confidence/config";
import {
  edgeBps,
  limitPriceBps,
  rawKellyBps,
  sizedKellyBps,
  sizedNotionalMicros,
} from "@/server/confidence/formula";
import type {
  EngineBook,
  EngineInput,
  EngineOutput,
  EngineWalkFill,
} from "@/server/confidence/types";
import {
  floorToLot,
  sharesCostMicros,
  SHARE_SCALE,
} from "@/server/money";

function reject(version: string, code: string, message: string): EngineOutput {
  return { accepted: false, version, code, message };
}

function walkAsks(
  book: EngineBook,
  limitBps: number,
  budgetMicros: bigint,
  lot: bigint,
): EngineWalkFill[] {
  const fills: EngineWalkFill[] = [];
  let remaining = budgetMicros;

  for (const level of book.asks) {
    if (remaining <= 0n) break;
    if (level.priceBps > limitBps) break;
    if (level.priceBps <= 0 || level.sizeMicros <= 0n) continue;

    const affordable = (remaining * BigInt(10_000)) / BigInt(level.priceBps);
    const take = floorToLot(
      affordable < level.sizeMicros ? affordable : level.sizeMicros,
      lot,
    );
    if (take <= 0n) continue;

    const cost = sharesCostMicros(take, level.priceBps);
    if (cost <= 0n || cost > remaining) continue;

    fills.push({
      priceBps: level.priceBps,
      sharesMicros: take,
      notionalMicros: cost,
    });
    remaining -= cost;
  }

  return fills;
}

function averagePriceBps(fills: EngineWalkFill[]) {
  const shares = fills.reduce((sum, fill) => sum + fill.sharesMicros, 0n);
  const cost = fills.reduce((sum, fill) => sum + fill.notionalMicros, 0n);
  if (shares <= 0n) return 0;
  return Number((cost * 10_000n) / shares);
}

export class ConfidenceEngine {
  constructor(private readonly config: ConfidenceEngineConfig) {}

  evaluate(input: EngineInput): EngineOutput {
    const { version } = this.config;
    const { confidenceBps, stakeMicros, book, outcome } = input;

    if (
      confidenceBps < this.config.minConfidenceBps ||
      confidenceBps > this.config.maxConfidenceBps
    ) {
      return reject(
        version,
        "CONFIDENCE_RANGE",
        `Confidence must be between ${this.config.minConfidenceBps / 100}% and ${this.config.maxConfidenceBps / 100}%.`,
      );
    }

    if (stakeMicros < this.config.minStakeMicros) {
      return reject(
        version,
        "STAKE_TOO_SMALL",
        "Stake is below the minimum.",
      );
    }

    if (stakeMicros > this.config.maxStakeMicros) {
      return reject(
        version,
        "STAKE_TOO_LARGE",
        "Stake is above the maximum.",
      );
    }

    const asks = [...book.asks].sort((a, b) => a.priceBps - b.priceBps);
    const bestAsk = asks[0];
    if (!bestAsk) {
      return reject(version, "NO_BOOK", "No ask liquidity on the selected outcome.");
    }

    const marketPriceBps = bestAsk.priceBps;
    const edge = edgeBps(confidenceBps, marketPriceBps);
    if (edge < this.config.minEdgeBps) {
      return reject(
        version,
        "NO_EDGE",
        `Confidence ${confidenceBps / 100}% is not above the market ask ${(marketPriceBps / 100).toFixed(2)}% by enough to size a position.`,
      );
    }

    const kelly = rawKellyBps(confidenceBps, marketPriceBps);
    const sizedKelly = sizedKellyBps(kelly, this.config);
    if (sizedKelly <= 0) {
      return reject(version, "NO_EDGE", "Kelly size is zero at this confidence.");
    }

    const budget = sizedNotionalMicros(stakeMicros, sizedKelly);
    if (budget <= 0n) {
      return reject(version, "NO_EDGE", "Sized notional is zero.");
    }

    const limit = limitPriceBps(
      marketPriceBps,
      confidenceBps,
      book.tickBps,
      this.config,
    );
    if (limit < marketPriceBps) {
      return reject(
        version,
        "LIMIT_UNMARKETABLE",
        "Computed limit price is below the best ask.",
      );
    }

    const fills = walkAsks({ ...book, asks }, limit, budget, this.config.shareLotMicros);
    const sharesMicros = fills.reduce((sum, fill) => sum + fill.sharesMicros, 0n);
    const notionalMicros = fills.reduce((sum, fill) => sum + fill.notionalMicros, 0n);

    if (sharesMicros < book.minSharesMicros || sharesMicros <= 0n) {
      return reject(
        version,
        "INSUFFICIENT_LIQUIDITY",
        "The order book cannot fill the minimum size at the engine limit.",
      );
    }

    if (notionalMicros > stakeMicros) {
      return reject(version, "STAKE_EXCEEDED", "Engine sized a notional larger than stake.");
    }

    const avgPriceBps = averagePriceBps(fills);
    const payoutMicros = (sharesMicros * 1_000_000n) / SHARE_SCALE;

    return {
      accepted: true,
      version,
      outcome,
      side: "BUY",
      tokenId: book.tokenId,
      confidenceBps,
      marketPriceBps,
      bestAskBps: marketPriceBps,
      edgeBps: edge,
      kellyBps: kelly,
      sizedKellyBps: sizedKelly,
      limitPriceBps: limit,
      avgPriceBps,
      sharesMicros,
      notionalMicros,
      payoutMicros,
      tickBps: book.tickBps,
      minSharesMicros: book.minSharesMicros,
      fills,
      config: this.config,
    };
  }
}

import type { Market as CatalogMarket } from "@/lib/markets";
import type {
  ConfidenceHistoryDTO,
  EngineQuote,
  ExecutionBatchDTO,
  ExecutionDTO,
  PredictionDTO,
  PositionDTO,
  SettlementReferenceDTO,
} from "@/lib/betting";
import { explorerTxUrl } from "@/lib/robinhood-chain";
import type { EngineResult } from "@/server/confidence/types";
import type { ConfidenceHistoryRow, PredictionBundle } from "@/server/betting/repository";
import {
  bpsToPct,
  formatPrice,
  formatShares,
  formatUsd,
} from "@/server/money";

export function toEngineQuote(
  market: CatalogMarket,
  result: EngineResult,
  bookSource: EngineQuote["book"],
): EngineQuote {
  return {
    accepted: true,
    engineVersion: result.version,
    position: {
      outcome: result.outcome,
      side: result.side,
      tokenId: result.tokenId,
      shares: formatShares(result.sharesMicros),
      limitPrice: formatPrice(result.limitPriceBps),
      avgPrice: formatPrice(result.avgPriceBps),
      notionalUsd: formatUsd(result.notionalMicros),
      payoutUsd: formatUsd(result.payoutMicros),
      edgeBps: result.edgeBps,
      kellyBps: result.kellyBps,
      sizedKellyBps: result.sizedKellyBps,
      marketPrice: formatPrice(result.marketPriceBps),
      bestAsk: formatPrice(result.bestAskBps),
      tickSize: formatPrice(result.tickBps),
      minOrderSize: formatShares(result.minSharesMicros),
      fills: result.fills.map((fill) => ({
        price: formatPrice(fill.priceBps),
        shares: formatShares(fill.sharesMicros),
        notionalUsd: formatUsd(fill.notionalMicros),
      })),
    },
    market: {
      id: market.id,
      title: market.title,
      source: market.source ?? "local",
      yesPrice: formatPrice((market.seats.find((seat) => seat.side === "lands")?.chance ?? 50) * 100),
      tokenId: result.tokenId,
    },
    book: bookSource,
  };
}

function toSettlementDTO(row: PredictionBundle["chainSettlements"][number] | undefined): SettlementReferenceDTO | null {
  if (!row) return null;
  return {
    chainId: row.chainId,
    network: row.network,
    status: row.status as SettlementReferenceDTO["status"],
    txHash: row.txHash,
    blockNumber: row.blockNumber?.toString() ?? null,
    confirmations: row.confirmations,
    payloadHash: row.payloadHash,
    explorerUrl: row.txHash ? explorerTxUrl(row.chainId, row.txHash) : null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
  };
}

export function toPredictionDTO(bundle: PredictionBundle): PredictionDTO {
  const execution = bundle.position?.executions[0] ?? null;
  const position: PositionDTO | null = bundle.position
    ? {
        id: bundle.position.id,
        outcome: bundle.position.outcome as PositionDTO["outcome"],
        side: bundle.position.side,
        tokenId: bundle.position.tokenId,
        shares: formatShares(bundle.position.sharesMicros),
        limitPrice: formatPrice(bundle.position.limitPriceBps),
        avgPrice: formatPrice(bundle.position.avgPriceBps),
        notionalUsd: formatUsd(bundle.position.notionalMicros),
        payoutUsd: formatUsd(bundle.position.payoutMicros),
        edgeBps: bundle.position.edgeBps,
        kellyBps: bundle.position.kellyBps,
        status: bundle.position.status,
      }
    : null;

  const executionDto: ExecutionDTO | null = execution
    ? {
        id: execution.id,
        venue: execution.venue,
        mode: execution.mode === "live" ? "live" : "paper",
        status: execution.status,
        orderType: execution.orderType,
        limitPrice: formatPrice(execution.limitPriceBps),
        sizeShares: formatShares(execution.sizeSharesMicros),
        notionalUsd: formatUsd(execution.notionalMicros),
        polymarketOrderId: execution.polymarketOrderId,
        errorMessage: execution.errorMessage,
        submittedAt: execution.submittedAt?.toISOString() ?? null,
        fills: execution.fills.map((fill) => ({
          id: fill.id,
          price: formatPrice(fill.priceBps),
          shares: formatShares(fill.sharesMicros),
          notionalUsd: formatUsd(fill.notionalMicros),
          feeUsd: formatUsd(fill.feeMicros),
          simulated: fill.isSimulated,
          venueTradeId: fill.venueTradeId,
          filledAt: fill.filledAt.toISOString(),
        })),
      }
    : null;

  return {
    id: bundle.id,
    marketId: bundle.marketId,
    marketTitle: bundle.market.title,
    walletAddress: bundle.walletAddress,
    outcome: bundle.outcome as PredictionDTO["outcome"],
    confidencePct: bpsToPct(bundle.confidenceBps),
    stakeUsd: formatUsd(bundle.stakeMicros),
    marketPrice: formatPrice(bundle.marketPriceBps),
    status: bundle.status,
    engineVersion: bundle.engineVersion,
    createdAt: bundle.createdAt.toISOString(),
    errorCode: bundle.errorCode,
    errorMessage: bundle.errorMessage,
    position,
    execution: executionDto,
    settlement: toSettlementDTO(bundle.chainSettlements?.[0]),
    marketResolution:
      bundle.market.resolvedAt && bundle.market.resolvedOutcome
        ? {
            outcome: bundle.market.resolvedOutcome as "YES" | "NO" | "INVALID",
            resolvedAt: bundle.market.resolvedAt.toISOString(),
          }
        : null,
  };
}

export function toConfidenceHistoryDTO(row: ConfidenceHistoryRow): ConfidenceHistoryDTO {
  const signed = formatShares(row.deltaSharesMicros < 0n ? -row.deltaSharesMicros : row.deltaSharesMicros);
  const sign = row.deltaSharesMicros < 0n ? "-" : row.deltaSharesMicros > 0n ? "+" : "";
  return {
    id: row.id,
    predictionId: row.predictionId,
    previousConfidencePct: bpsToPct(row.previousConfidenceBps),
    newConfidencePct: bpsToPct(row.newConfidenceBps),
    previousPosition: {
      shares: formatShares(row.previousSharesMicros),
      notionalUsd: formatUsd(row.previousNotionalMicros),
      avgPrice: formatPrice(row.previousAvgPriceBps),
    },
    desiredPosition: {
      shares: formatShares(row.desiredSharesMicros),
      notionalUsd: formatUsd(row.desiredNotionalMicros),
      avgPrice: formatPrice(row.desiredAvgPriceBps || row.previousAvgPriceBps),
    },
    deltaShares: `${sign}${signed}`,
    side: row.side === "SELL" || row.side === "BUY" || row.side === "NONE" ? row.side : "NONE",
    marketPrice: formatPrice(row.marketPriceBps),
    status: row.status,
    executionId: row.executionId,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    reconciledAt: row.reconciledAt?.toISOString() ?? null,
  };
}

export function toExecutionBatchDTO(row: import("@/server/execution/types").ExecutionBatchRow): ExecutionBatchDTO {
  const metrics = row.metrics;
  return {
    id: row.id,
    marketId: row.marketId,
    tokenId: row.tokenId,
    outcome: row.outcome,
    netSide: row.netSide,
    status: row.status,
    intentCount: row.intents.length,
    sliceCount: row.slices.length,
    metrics: {
      requestedShares: formatShares(metrics.requestedSharesMicros),
      requestedNotionalUsd: formatUsd(metrics.requestedNotionalMicros),
      executedShares: formatShares(metrics.executedSharesMicros),
      executedNotionalUsd: formatUsd(metrics.executedNotionalMicros),
      averageExecutionPrice: formatPrice(metrics.avgPriceBps || metrics.arrivalPriceBps),
      expectedSlippageBps: metrics.expectedSlippageBps,
      actualSlippageBps: metrics.actualSlippageBps,
      independentExpectedSlippageBps: metrics.independentExpectedSlippageBps,
      measuredAggregationSlippageDeltaBps: metrics.measuredAggregationSlippageDeltaBps,
      latencyMs: metrics.latencyMs,
      feeUsd: formatUsd(metrics.feeMicros),
      venueShares: formatShares(metrics.venueSharesMicros),
      internalShares: formatShares(metrics.internalSharesMicros),
    },
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    reconciledAt: row.reconciledAt?.toISOString() ?? null,
  };
}

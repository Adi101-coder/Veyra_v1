import type {
  BettingStore,
  ConfidenceHistoryRow,
  CreatePredictionInput,
  PredictionBundle,
  ReconcileAdjustmentInput,
} from "@/server/betting/repository";
import { applyFillsToHeld, derivePositionStatus, settledHistoryStatus, unseenFills } from "@/server/betting/ledger";

export function memoryStore(): BettingStore {
  const markets = new Map<string, PredictionBundle["market"]>();
  const predictions: PredictionBundle[] = [];
  const history: ConfidenceHistoryRow[] = [];
  let seq = 1;
  const nextId = () => `id_${seq++}`;

  const findBundleByPosition = (positionId: string) =>
    predictions.find((row) => row.position?.id === positionId);

  const settleHistoryForExecution = (bundle: PredictionBundle, executionId: string, status: string) => {
    const settled = settledHistoryStatus(status);
    if (!settled) return;
    for (const row of history) {
      if (row.executionId !== executionId || row.status !== "pending") continue;
      row.status = settled;
      row.reconciledAt = new Date();
      if (settled === "filled") {
        bundle.confidenceBps = row.newConfidenceBps;
        bundle.lockVersion += 1;
      }
    }
  };

  return {
    async upsertMarket(market) {
      markets.set(market.id, {
        ...market,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as PredictionBundle["market"]);
    },
    async countPendingExecutions(marketId, createdAtOrBefore) {
      return predictions
        .filter((row) => row.marketId === marketId)
        .flatMap((row) => row.position?.executions ?? [])
        .filter((row) => row.createdAt <= createdAtOrBefore && ["created", "submitted", "open", "unknown"].includes(row.status)).length;
    },
    async listForScoring(marketId, createdAtOrBefore) {
      return predictions.filter((row) => row.marketId === marketId && row.createdAt <= createdAtOrBefore);
    },
    async findByExecutionId(executionId) {
      return (
        predictions.find((row) => row.position?.executions.some((execution) => execution.id === executionId)) ??
        null
      );
    },
    async getMarket(id) {
      const market = markets.get(id);
      return market
        ? {
            id: market.id,
            source: market.source,
            status: market.status,
            resolvedAt: market.resolvedAt ?? null,
            resolvedOutcome: market.resolvedOutcome ?? null,
          }
        : null;
    },
    async listOpenVenueMarketIds() {
      return [...markets.values()]
        .filter((row) => row.source === "polymarket" && !row.resolvedAt && predictions.some((p) => p.marketId === row.id))
        .map((row) => row.id);
    },
    async findByIdempotency(walletAddress, key) {
      return (
        predictions.find(
          (row) => row.walletAddress === walletAddress && row.idempotencyKey === key,
        ) ?? null
      );
    },
    async getPrediction(predictionId) {
      return predictions.find((row) => row.id === predictionId) ?? null;
    },
    async listPredictions(filter) {
      return predictions.filter((row) => {
        if (filter.marketId && row.marketId !== filter.marketId) return false;
        if (filter.walletAddress && row.walletAddress !== filter.walletAddress) return false;
        return true;
      });
    },
    async createPrediction(input: CreatePredictionInput) {
      const market = markets.get(input.marketId);
      if (!market) throw new Error("market missing");
      const now = new Date();
      const executionId = nextId();
      const positionId = nextId();
      const predictionId = nextId();
      const bundle = {
        id: predictionId,
        walletAddress: input.walletAddress,
        marketId: input.marketId,
        market,
        outcome: input.outcome,
        confidenceBps: input.confidenceBps,
        stakeMicros: input.stakeMicros,
        marketPriceBps: input.marketPriceBps,
        engineVersion: input.engineVersion,
        engineInputJson: input.engineInputJson,
        engineOutputJson: input.engineOutputJson,
        idempotencyKey: input.idempotencyKey ?? null,
        status: input.status,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        createdAt: now,
        lockVersion: 0,
        position: input.position
          ? {
              id: positionId,
              predictionId,
              marketId: input.position.marketId,
              walletAddress: input.position.walletAddress,
              outcome: input.position.outcome,
              side: input.position.side,
              tokenId: input.position.tokenId,
              sharesMicros: input.position.sharesMicros,
              limitPriceBps: input.position.limitPriceBps,
              avgPriceBps: input.position.avgPriceBps,
              notionalMicros: input.position.notionalMicros,
              payoutMicros: input.position.payoutMicros,
              edgeBps: input.position.edgeBps,
              kellyBps: input.position.kellyBps,
              status: input.position.status,
              createdAt: now,
              updatedAt: now,
              executions: [
                {
                  id: executionId,
                  positionId,
                  venue: input.position.execution.venue,
                  mode: input.position.execution.mode,
                  status: input.position.execution.status,
                  tokenId: input.position.execution.tokenId,
                  side: input.position.execution.side,
                  orderType: input.position.execution.orderType,
                  limitPriceBps: input.position.execution.limitPriceBps,
                  sizeSharesMicros: input.position.execution.sizeSharesMicros,
                  notionalMicros: input.position.execution.notionalMicros,
                  polymarketOrderId: null,
                  requestJson: input.position.execution.requestJson,
                  responseJson: null,
                  errorMessage: null,
                  submittedAt: null,
                  createdAt: now,
                  updatedAt: now,
                  fills: [],
                },
              ],
            }
          : null,
      } as PredictionBundle;
      predictions.push(bundle);
      return bundle;
    },
    async applyExecutionResult(executionId, patch) {
      const bundle = predictions.find((row) =>
        row.position?.executions.some((execution) => execution.id === executionId),
      );
      if (!bundle?.position) throw new Error("missing execution");
      const execution = bundle.position.executions.find((item) => item.id === executionId);
      if (!execution) throw new Error("missing execution");
      const fresh = unseenFills(execution.fills, patch.fills);
      execution.status = patch.status;
      execution.polymarketOrderId = patch.polymarketOrderId ?? execution.polymarketOrderId;
      execution.responseJson = patch.responseJson;
      execution.errorMessage = patch.errorMessage;
      execution.submittedAt = execution.submittedAt ?? patch.submittedAt;
      execution.fills.push(
        ...fresh.map((fill, index) => ({
          id: `fill_${executionId}_${execution.fills.length + index}`,
          executionId,
          venueTradeId: fill.venueTradeId,
          priceBps: fill.priceBps,
          sharesMicros: fill.sharesMicros,
          notionalMicros: fill.notionalMicros,
          feeMicros: fill.feeMicros,
          isSimulated: fill.isSimulated,
          filledAt: new Date(),
          rawJson: fill.rawJson,
        })),
      );
      const held = applyFillsToHeld(bundle.position, execution.side, fresh);
      bundle.position.sharesMicros = held.sharesMicros;
      bundle.position.notionalMicros = held.notionalMicros;
      bundle.position.avgPriceBps = held.avgPriceBps;
      bundle.position.payoutMicros = held.sharesMicros;
      bundle.position.status = derivePositionStatus(bundle.position.executions, held.sharesMicros);
      settleHistoryForExecution(bundle, executionId, execution.status);
      return bundle;
    },

    async claimAdjustmentLock(positionId) {
      const bundle = findBundleByPosition(positionId);
      if (!bundle?.position) return false;
      if (!["filled", "partial", "closed"].includes(bundle.position.status)) return false;
      bundle.position.status = "adjusting";
      bundle.position.updatedAt = new Date();
      return true;
    },
    async listStaleAdjustments(lockedBefore) {
      return predictions
        .filter((row) => row.position?.status === "adjusting" && row.position.updatedAt < lockedBefore)
        .map((row) => {
          const pending = history.filter((item) => item.predictionId === row.id && item.status === "pending").at(-1);
          return { positionId: row.position!.id, predictionId: row.id, historyId: pending?.id ?? null, executionId: pending?.executionId ?? null };
        });
    },
    async releaseAdjustmentLock(positionId, status) {
      const bundle = findBundleByPosition(positionId);
      if (bundle?.position?.status !== "adjusting") return;
      if (bundle?.position) bundle.position.status = status;
    },
    async findHistoryByIdempotency(predictionId, key) {
      return history.find((row) => row.predictionId === predictionId && row.idempotencyKey === key) ?? null;
    },
    async createHistoryAndExecution(input) {
      if (input.history.idempotencyKey) {
        const existing = history.find(
          (row) =>
            row.predictionId === input.history.predictionId &&
            row.idempotencyKey === input.history.idempotencyKey,
        );
        if (existing) throw new Error("Unique constraint failed on confidence_history");
      }
      const bundle = predictions.find((row) => row.id === input.history.predictionId);
      if (!bundle?.position) throw new Error("missing position");
      let executionId: string | null = null;
      if (input.execution) {
        executionId = nextId();
        const now = new Date();
        bundle.position.executions.unshift({
          id: executionId,
          positionId: bundle.position.id,
          venue: input.execution.venue,
          mode: input.execution.mode,
          status: input.execution.status,
          tokenId: input.execution.tokenId,
          side: input.execution.side,
          orderType: input.execution.orderType,
          limitPriceBps: input.execution.limitPriceBps,
          sizeSharesMicros: input.execution.sizeSharesMicros,
          notionalMicros: input.execution.notionalMicros,
          polymarketOrderId: null,
          requestJson: input.execution.requestJson,
          responseJson: null,
          errorMessage: null,
          submittedAt: null,
          createdAt: now,
          updatedAt: now,
          fills: [],
        });
      }
      const row: ConfidenceHistoryRow = {
        id: nextId(),
        ...input.history,
        bookHash: input.history.bookHash ?? null,
        idempotencyKey: input.history.idempotencyKey ?? null,
        executionId,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date(),
        reconciledAt: null,
      };
      history.unshift(row);
      return { history: row, executionId };
    },
    async reconcileAdjustment(input: ReconcileAdjustmentInput) {
      const row = history.find((item) => item.id === input.historyId);
      if (!row) throw new Error("missing history");
      const bundle = predictions.find((item) => item.id === row.predictionId);
      if (!bundle?.position) throw new Error("missing prediction");
      if (row.status !== "pending") return bundle; // already settled: idempotent
      const position = bundle.position;
      let status: string;
      if (input.executionId) {
        const execution = position.executions.find((item) => item.id === input.executionId);
        if (!execution) throw new Error("missing execution");
        const fresh = unseenFills(execution.fills, input.fills);
        execution.status = input.executionStatus;
        execution.polymarketOrderId = input.polymarketOrderId ?? execution.polymarketOrderId;
        execution.responseJson = input.responseJson;
        execution.errorMessage = input.errorMessage;
        execution.submittedAt = execution.submittedAt ?? input.submittedAt;
        execution.fills.push(
          ...fresh.map((fill, index) => ({
            id: `fill_${input.executionId}_${execution.fills.length + index}`,
            executionId: input.executionId!,
            ...fill,
            filledAt: new Date(),
          })),
        );
        const held = applyFillsToHeld(position, execution.side, fresh);
        position.sharesMicros = held.sharesMicros;
        position.notionalMicros = held.notionalMicros;
        position.avgPriceBps = held.avgPriceBps;
        position.payoutMicros = held.sharesMicros;
        status = settledHistoryStatus(input.executionStatus) ?? "pending";
      } else {
        status = "noop";
      }
      position.status = derivePositionStatus(position.executions, position.sharesMicros);
      if (input.positionMeta) Object.assign(position, input.positionMeta);
      row.status = status;
      row.reconciledAt = status === "pending" ? null : new Date();
      row.errorCode = status === "failed" ? (input.historyErrorCode ?? "EXECUTION_FAILED") : null;
      row.errorMessage = status === "failed" ? (input.historyErrorMessage ?? input.errorMessage) : null;
      if (status === "filled" || status === "noop") {
        bundle.confidenceBps = row.newConfidenceBps;
        bundle.marketPriceBps = row.marketPriceBps;
        bundle.lockVersion += 1;
      }
      return bundle;
    },
    async listHistory(predictionId) {
      return history.filter((row) => row.predictionId === predictionId);
    },
  };
}

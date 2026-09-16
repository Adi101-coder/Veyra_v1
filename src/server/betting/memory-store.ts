import type {
  BettingStore,
  ConfidenceHistoryRow,
  CreatePredictionInput,
  PredictionBundle,
  ReconcileAdjustmentInput,
} from "@/server/betting/repository";

export function memoryStore(): BettingStore {
  const markets = new Map<string, PredictionBundle["market"]>();
  const predictions: PredictionBundle[] = [];
  const history: ConfidenceHistoryRow[] = [];
  let seq = 1;
  const nextId = () => `id_${seq++}`;

  const findBundleByPosition = (positionId: string) =>
    predictions.find((row) => row.position?.id === positionId);

  return {
    async upsertMarket(market) {
      markets.set(market.id, {
        ...market,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as PredictionBundle["market"]);
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
      execution.status = patch.status;
      execution.polymarketOrderId = patch.polymarketOrderId;
      execution.responseJson = patch.responseJson;
      execution.errorMessage = patch.errorMessage;
      execution.submittedAt = patch.submittedAt;
      execution.fills = patch.fills.map((fill, index) => ({
        id: `fill_${index}`,
        executionId,
        venueTradeId: fill.venueTradeId,
        priceBps: fill.priceBps,
        sharesMicros: fill.sharesMicros,
        notionalMicros: fill.notionalMicros,
        feeMicros: fill.feeMicros,
        isSimulated: fill.isSimulated,
        filledAt: new Date(),
        rawJson: fill.rawJson,
      }));
      bundle.position.status = patch.positionStatus;
      return bundle;
    },
    async claimAdjustmentLock(positionId) {
      const bundle = findBundleByPosition(positionId);
      if (!bundle?.position) return false;
      if (bundle.position.status === "adjusting") return false;
      bundle.position.status = "adjusting";
      return true;
    },
    async releaseAdjustmentLock(positionId, status) {
      const bundle = findBundleByPosition(positionId);
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
      row.status = input.historyStatus;
      row.errorCode = input.historyErrorCode ?? null;
      row.errorMessage = input.historyErrorMessage ?? null;
      row.reconciledAt = new Date();
      row.executionId = input.executionId;
      if (input.executionId) {
        const execution = bundle.position.executions.find((item) => item.id === input.executionId);
        if (execution) {
          execution.status = input.executionStatus;
          execution.polymarketOrderId = input.polymarketOrderId;
          execution.responseJson = input.responseJson;
          execution.errorMessage = input.errorMessage;
          execution.submittedAt = input.submittedAt;
          execution.fills = input.fills.map((fill, index) => ({
            id: `adj_fill_${index}`,
            executionId: input.executionId!,
            venueTradeId: fill.venueTradeId,
            priceBps: fill.priceBps,
            sharesMicros: fill.sharesMicros,
            notionalMicros: fill.notionalMicros,
            feeMicros: fill.feeMicros,
            isSimulated: fill.isSimulated,
            filledAt: new Date(),
            rawJson: fill.rawJson,
          }));
        }
      }
      bundle.position.sharesMicros = input.position.sharesMicros;
      bundle.position.notionalMicros = input.position.notionalMicros;
      bundle.position.avgPriceBps = input.position.avgPriceBps;
      bundle.position.payoutMicros = input.position.payoutMicros;
      bundle.position.status = input.position.status;
      if (input.position.edgeBps != null) bundle.position.edgeBps = input.position.edgeBps;
      if (input.position.kellyBps != null) bundle.position.kellyBps = input.position.kellyBps;
      if (input.position.limitPriceBps != null) bundle.position.limitPriceBps = input.position.limitPriceBps;
      if (input.prediction) {
        bundle.confidenceBps = input.prediction.confidenceBps;
        bundle.marketPriceBps = input.prediction.marketPriceBps;
        if (input.prediction.engineOutputJson) {
          bundle.engineOutputJson = input.prediction.engineOutputJson;
        }
        bundle.lockVersion += 1;
      }
      return bundle;
    },
    async listHistory(predictionId) {
      return history.filter((row) => row.predictionId === predictionId);
    },
  };
}

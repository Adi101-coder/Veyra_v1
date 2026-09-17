-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "conditionId" TEXT,
    "clobTokenYes" TEXT,
    "clobTokenNo" TEXT,
    "yesPriceBps" INTEGER NOT NULL DEFAULT 5000,
    "volumeUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "liquidityUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "resolvesAt" TEXT,
    "imageUrl" TEXT,
    "accepting" BOOLEAN NOT NULL DEFAULT true,
    "resolvedOutcome" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "confidenceBps" INTEGER NOT NULL,
    "stakeMicros" BIGINT NOT NULL,
    "marketPriceBps" INTEGER NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "engineInputJson" TEXT NOT NULL,
    "engineOutputJson" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "sharesMicros" BIGINT NOT NULL,
    "limitPriceBps" INTEGER NOT NULL,
    "avgPriceBps" INTEGER NOT NULL,
    "notionalMicros" BIGINT NOT NULL,
    "payoutMicros" BIGINT NOT NULL,
    "edgeBps" INTEGER NOT NULL,
    "kellyBps" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "venue" TEXT NOT NULL DEFAULT 'polymarket',
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "limitPriceBps" INTEGER NOT NULL,
    "sizeSharesMicros" BIGINT NOT NULL,
    "notionalMicros" BIGINT NOT NULL,
    "polymarketOrderId" TEXT,
    "requestJson" TEXT NOT NULL,
    "responseJson" TEXT,
    "errorMessage" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fill" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "venueTradeId" TEXT NOT NULL,
    "priceBps" INTEGER NOT NULL,
    "sharesMicros" BIGINT NOT NULL,
    "notionalMicros" BIGINT NOT NULL,
    "feeMicros" BIGINT NOT NULL DEFAULT 0,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "filledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawJson" TEXT,

    CONSTRAINT "Fill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "confidence_history" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "previousConfidenceBps" INTEGER NOT NULL,
    "newConfidenceBps" INTEGER NOT NULL,
    "previousSharesMicros" BIGINT NOT NULL,
    "previousNotionalMicros" BIGINT NOT NULL,
    "previousAvgPriceBps" INTEGER NOT NULL,
    "previousPositionJson" TEXT NOT NULL,
    "desiredSharesMicros" BIGINT NOT NULL,
    "desiredNotionalMicros" BIGINT NOT NULL,
    "desiredAvgPriceBps" INTEGER NOT NULL,
    "desiredPositionJson" TEXT NOT NULL,
    "deltaSharesMicros" BIGINT NOT NULL,
    "side" TEXT NOT NULL,
    "marketPriceBps" INTEGER NOT NULL,
    "bookHash" TEXT,
    "status" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "executionId" TEXT,
    "previousPositionStatus" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciledAt" TIMESTAMP(3),

    CONSTRAINT "confidence_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_batches" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "netSide" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "tickSize" TEXT NOT NULL,
    "negRisk" BOOLEAN NOT NULL DEFAULT false,
    "bookHash" TEXT,
    "bookSnapshotJson" TEXT,
    "strategyJson" TEXT,
    "requestedSharesMicros" BIGINT NOT NULL,
    "requestedNotionalMicros" BIGINT NOT NULL,
    "executedSharesMicros" BIGINT NOT NULL DEFAULT 0,
    "executedNotionalMicros" BIGINT NOT NULL DEFAULT 0,
    "venueSharesMicros" BIGINT NOT NULL DEFAULT 0,
    "internalSharesMicros" BIGINT NOT NULL DEFAULT 0,
    "avgPriceBps" INTEGER NOT NULL DEFAULT 0,
    "arrivalPriceBps" INTEGER NOT NULL DEFAULT 0,
    "expectedSlippageBps" INTEGER NOT NULL DEFAULT 0,
    "actualSlippageBps" INTEGER NOT NULL DEFAULT 0,
    "independentExpectedSlippageBps" INTEGER NOT NULL DEFAULT 0,
    "measuredAggregationSlippageDeltaBps" INTEGER NOT NULL DEFAULT 0,
    "feeMicros" BIGINT NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "reconcileToken" TEXT,
    "reconcileClaimedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "queuedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "execution_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_intents" (
    "id" TEXT NOT NULL,
    "batchId" TEXT,
    "executionId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "predictionId" TEXT,
    "marketId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "sharesMicros" BIGINT NOT NULL,
    "notionalMicros" BIGINT NOT NULL,
    "limitPriceBps" INTEGER NOT NULL,
    "orderType" TEXT NOT NULL,
    "tickSize" TEXT NOT NULL,
    "negRisk" BOOLEAN NOT NULL DEFAULT false,
    "quotedPriceBps" INTEGER,
    "bookHash" TEXT,
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL,
    "claimToken" TEXT,
    "claimedAt" TIMESTAMP(3),
    "executedSharesMicros" BIGINT NOT NULL DEFAULT 0,
    "executedNotionalMicros" BIGINT NOT NULL DEFAULT 0,
    "avgPriceBps" INTEGER NOT NULL DEFAULT 0,
    "feeMicros" BIGINT NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "execution_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_slices" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "sharesMicros" BIGINT NOT NULL,
    "notionalMicros" BIGINT NOT NULL,
    "limitPriceBps" INTEGER NOT NULL,
    "orderType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "polymarketOrderId" TEXT,
    "requestJson" TEXT NOT NULL,
    "responseJson" TEXT,
    "errorMessage" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_slices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_reputation" (
    "walletAddress" TEXT NOT NULL,
    "totalPredictions" INTEGER NOT NULL DEFAULT 0,
    "resolvedPredictions" INTEGER NOT NULL DEFAULT 0,
    "correctPredictions" INTEGER NOT NULL DEFAULT 0,
    "confidenceSumBps" BIGINT NOT NULL DEFAULT 0,
    "brierSumMicros" BIGINT NOT NULL DEFAULT 0,
    "notionalSumMicros" BIGINT NOT NULL DEFAULT 0,
    "pnlSumMicros" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_reputation_pkey" PRIMARY KEY ("walletAddress")
);

-- CreateTable
CREATE TABLE "user_reputation_category" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "totalPredictions" INTEGER NOT NULL DEFAULT 0,
    "resolvedPredictions" INTEGER NOT NULL DEFAULT 0,
    "correctPredictions" INTEGER NOT NULL DEFAULT 0,
    "confidenceSumBps" BIGINT NOT NULL DEFAULT 0,
    "brierSumMicros" BIGINT NOT NULL DEFAULT 0,
    "notionalSumMicros" BIGINT NOT NULL DEFAULT 0,
    "pnlSumMicros" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_reputation_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calibration_bins" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "binIndex" INTEGER NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "sumConfidenceBps" BIGINT NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calibration_bins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prediction_scores" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "predictedOutcome" TEXT NOT NULL,
    "resolvedOutcome" TEXT NOT NULL,
    "confidenceBps" INTEGER NOT NULL,
    "impliedYesBps" INTEGER NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "brierMicros" BIGINT NOT NULL,
    "notionalMicros" BIGINT NOT NULL,
    "payoutMicros" BIGINT NOT NULL,
    "pnlMicros" BIGINT NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prediction_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reputation_jobs" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "resolvedOutcome" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "reputation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reputation_opens" (
    "predictionId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_opens_pkey" PRIMARY KEY ("predictionId")
);

-- CreateTable
CREATE TABLE "conviction_snapshots" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "participants" INTEGER NOT NULL,
    "capitalMicros" BIGINT NOT NULL,
    "averageConfidenceBps" INTEGER,
    "capitalWeightedConfidenceBps" INTEGER,
    "convictionBps" INTEGER,
    "polymarketProbabilityBps" INTEGER,
    "divergenceBps" INTEGER,
    "distributionJson" TEXT NOT NULL,
    "inputsHash" TEXT,
    "bucketStart" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conviction_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_nonces" (
    "nonce" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_nonces_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "chain_settlements" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "network" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "calldata" TEXT NOT NULL,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "nonce" INTEGER,
    "txHash" TEXT,
    "rawTx" TEXT,
    "gasLimit" TEXT,
    "maxFeePerGasWei" TEXT,
    "blockNumber" BIGINT,
    "blockHash" TEXT,
    "gasUsed" BIGINT,
    "effectiveGasPriceWei" TEXT,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorKind" TEXT,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "claimToken" TEXT,
    "claimedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_leases" (
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_leases_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "inventory_reconciliation_runs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "tradesSince" TIMESTAMP(3),
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "fingerprint" TEXT,
    "summaryJson" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "inventory_reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_findings" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "tokenId" TEXT,
    "predictionId" TEXT,
    "executionId" TEXT,
    "venueTradeId" TEXT,
    "expected" TEXT,
    "actual" TEXT,
    "detailJson" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,

    CONSTRAINT "inventory_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Prediction_marketId_createdAt_idx" ON "Prediction"("marketId", "createdAt");

-- CreateIndex
CREATE INDEX "Prediction_walletAddress_createdAt_idx" ON "Prediction"("walletAddress", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Prediction_walletAddress_idempotencyKey_key" ON "Prediction"("walletAddress", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Position_predictionId_key" ON "Position"("predictionId");

-- CreateIndex
CREATE INDEX "Position_walletAddress_createdAt_idx" ON "Position"("walletAddress", "createdAt");

-- CreateIndex
CREATE INDEX "Position_marketId_idx" ON "Position"("marketId");

-- CreateIndex
CREATE INDEX "Execution_polymarketOrderId_idx" ON "Execution"("polymarketOrderId");

-- CreateIndex
CREATE INDEX "Execution_positionId_idx" ON "Execution"("positionId");

-- CreateIndex
CREATE INDEX "Fill_executionId_idx" ON "Fill"("executionId");

-- CreateIndex
CREATE UNIQUE INDEX "Fill_executionId_venueTradeId_key" ON "Fill"("executionId", "venueTradeId");

-- CreateIndex
CREATE INDEX "confidence_history_predictionId_createdAt_idx" ON "confidence_history"("predictionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "confidence_history_predictionId_idempotencyKey_key" ON "confidence_history"("predictionId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "execution_batches_idempotencyKey_key" ON "execution_batches"("idempotencyKey");

-- CreateIndex
CREATE INDEX "execution_batches_tokenId_status_idx" ON "execution_batches"("tokenId", "status");

-- CreateIndex
CREATE INDEX "execution_batches_createdAt_idx" ON "execution_batches"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "execution_intents_executionId_key" ON "execution_intents"("executionId");

-- CreateIndex
CREATE UNIQUE INDEX "execution_intents_idempotencyKey_key" ON "execution_intents"("idempotencyKey");

-- CreateIndex
CREATE INDEX "execution_intents_tokenId_status_idx" ON "execution_intents"("tokenId", "status");

-- CreateIndex
CREATE INDEX "execution_intents_positionId_idx" ON "execution_intents"("positionId");

-- CreateIndex
CREATE INDEX "execution_intents_claimToken_idx" ON "execution_intents"("claimToken");

-- CreateIndex
CREATE INDEX "execution_slices_batchId_idx" ON "execution_slices"("batchId");

-- CreateIndex
CREATE INDEX "execution_slices_polymarketOrderId_idx" ON "execution_slices"("polymarketOrderId");

-- CreateIndex
CREATE INDEX "user_reputation_category_walletAddress_idx" ON "user_reputation_category"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "user_reputation_category_walletAddress_category_key" ON "user_reputation_category"("walletAddress", "category");

-- CreateIndex
CREATE INDEX "calibration_bins_walletAddress_idx" ON "calibration_bins"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "calibration_bins_walletAddress_binIndex_key" ON "calibration_bins"("walletAddress", "binIndex");

-- CreateIndex
CREATE UNIQUE INDEX "prediction_scores_predictionId_key" ON "prediction_scores"("predictionId");

-- CreateIndex
CREATE INDEX "prediction_scores_walletAddress_resolvedAt_idx" ON "prediction_scores"("walletAddress", "resolvedAt");

-- CreateIndex
CREATE INDEX "prediction_scores_marketId_idx" ON "prediction_scores"("marketId");

-- CreateIndex
CREATE UNIQUE INDEX "reputation_jobs_marketId_key" ON "reputation_jobs"("marketId");

-- CreateIndex
CREATE INDEX "reputation_jobs_status_createdAt_idx" ON "reputation_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "conviction_snapshots_marketId_createdAt_idx" ON "conviction_snapshots"("marketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "conviction_snapshots_marketId_bucketStart_key" ON "conviction_snapshots"("marketId", "bucketStart");

-- CreateIndex
CREATE INDEX "auth_nonces_expiresAt_idx" ON "auth_nonces"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "chain_settlements_txHash_key" ON "chain_settlements"("txHash");

-- CreateIndex
CREATE INDEX "chain_settlements_status_nextAttemptAt_idx" ON "chain_settlements"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "chain_settlements_predictionId_chainId_kind_key" ON "chain_settlements"("predictionId", "chainId", "kind");

-- CreateIndex
CREATE INDEX "inventory_reconciliation_runs_startedAt_idx" ON "inventory_reconciliation_runs"("startedAt");

-- CreateIndex
CREATE INDEX "inventory_findings_runId_severity_idx" ON "inventory_findings"("runId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_findings_runId_fingerprint_key" ON "inventory_findings"("runId", "fingerprint");

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confidence_history" ADD CONSTRAINT "confidence_history_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confidence_history" ADD CONSTRAINT "confidence_history_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_intents" ADD CONSTRAINT "execution_intents_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "execution_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_intents" ADD CONSTRAINT "execution_intents_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_slices" ADD CONSTRAINT "execution_slices_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "execution_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reputation_category" ADD CONSTRAINT "user_reputation_category_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "user_reputation"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_bins" ADD CONSTRAINT "calibration_bins_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "user_reputation"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_scores" ADD CONSTRAINT "prediction_scores_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_scores" ADD CONSTRAINT "prediction_scores_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "user_reputation"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conviction_snapshots" ADD CONSTRAINT "conviction_snapshots_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_settlements" ADD CONSTRAINT "chain_settlements_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_findings" ADD CONSTRAINT "inventory_findings_runId_fkey" FOREIGN KEY ("runId") REFERENCES "inventory_reconciliation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Money and lifecycle invariants enforced by the database (kept from the SQLite baseline).
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_confidence_range" CHECK ("confidenceBps" BETWEEN 0 AND 10000);
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_stake_positive" CHECK ("stakeMicros" > 0);
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_outcome_valid" CHECK ("outcome" IN ('YES', 'NO'));
ALTER TABLE "Position" ADD CONSTRAINT "Position_shares_nonnegative" CHECK ("sharesMicros" >= 0);
ALTER TABLE "Position" ADD CONSTRAINT "Position_notional_nonnegative" CHECK ("notionalMicros" >= 0);
ALTER TABLE "Position" ADD CONSTRAINT "Position_status_valid" CHECK ("status" IN ('pending', 'adjusting', 'partial', 'filled', 'closed', 'failed', 'open'));
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_side_valid" CHECK ("side" IN ('BUY', 'SELL'));
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_status_valid" CHECK ("status" IN ('created', 'submitted', 'open', 'unknown', 'filled', 'partial', 'rejected', 'failed', 'noop'));
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_shares_positive" CHECK ("sharesMicros" > 0);
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_notional_nonnegative" CHECK ("notionalMicros" >= 0);
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_price_range" CHECK ("priceBps" BETWEEN 0 AND 10000);
ALTER TABLE "chain_settlements" ADD CONSTRAINT "chain_settlements_chain_valid" CHECK (("chainId" = 46630 AND "network" = 'testnet') OR ("chainId" = 4663 AND "network" = 'mainnet'));
ALTER TABLE "chain_settlements" ADD CONSTRAINT "chain_settlements_status_valid" CHECK ("status" IN ('queued', 'signing', 'signed', 'submitted', 'confirmed', 'reverted', 'failed'));
ALTER TABLE "chain_settlements" ADD CONSTRAINT "chain_settlements_receipt_required" CHECK ("status" NOT IN ('confirmed', 'reverted') OR ("txHash" IS NOT NULL AND "blockNumber" IS NOT NULL));
ALTER TABLE "chain_settlements" ADD CONSTRAINT "chain_settlements_tx_required" CHECK ("status" NOT IN ('signed', 'submitted') OR ("txHash" IS NOT NULL AND "rawTx" IS NOT NULL AND "nonce" IS NOT NULL));

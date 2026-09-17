-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "conditionId" TEXT,
    "clobTokenYes" TEXT,
    "clobTokenNo" TEXT,
    "yesPriceBps" INTEGER NOT NULL DEFAULT 5000,
    "volumeUsd" REAL NOT NULL DEFAULT 0,
    "liquidityUsd" REAL NOT NULL DEFAULT 0,
    "resolvesAt" TEXT,
    "imageUrl" TEXT,
    "accepting" BOOLEAN NOT NULL DEFAULT true,
    "resolvedOutcome" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockVersion" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Prediction_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Prediction_confidence_range" CHECK ("confidenceBps" BETWEEN 0 AND 10000),
    CONSTRAINT "Prediction_stake_positive" CHECK ("stakeMicros" > 0),
    CONSTRAINT "Prediction_outcome_valid" CHECK ("outcome" IN ('YES', 'NO'))
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Position_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Position_shares_nonnegative" CHECK ("sharesMicros" >= 0),
    CONSTRAINT "Position_notional_nonnegative" CHECK ("notionalMicros" >= 0),
    CONSTRAINT "Position_status_valid" CHECK ("status" IN ('pending', 'adjusting', 'partial', 'filled', 'closed', 'failed', 'open'))
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "submittedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Execution_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Execution_side_valid" CHECK ("side" IN ('BUY', 'SELL')),
    CONSTRAINT "Execution_status_valid" CHECK ("status" IN ('created', 'submitted', 'open', 'unknown', 'filled', 'partial', 'rejected', 'failed', 'noop'))
);

-- CreateTable
CREATE TABLE "Fill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "executionId" TEXT NOT NULL,
    "venueTradeId" TEXT NOT NULL,
    "priceBps" INTEGER NOT NULL,
    "sharesMicros" BIGINT NOT NULL,
    "notionalMicros" BIGINT NOT NULL,
    "feeMicros" BIGINT NOT NULL DEFAULT 0,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "filledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawJson" TEXT,
    CONSTRAINT "Fill_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Fill_shares_positive" CHECK ("sharesMicros" > 0),
    CONSTRAINT "Fill_notional_nonnegative" CHECK ("notionalMicros" >= 0),
    CONSTRAINT "Fill_price_range" CHECK ("priceBps" BETWEEN 0 AND 10000)
);

-- CreateTable
CREATE TABLE "confidence_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciledAt" DATETIME,
    CONSTRAINT "confidence_history_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "confidence_history_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "execution_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "queuedAt" DATETIME,
    "submittedAt" DATETIME,
    "reconciledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "execution_intents" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "claimedAt" DATETIME,
    "executedSharesMicros" BIGINT NOT NULL DEFAULT 0,
    "executedNotionalMicros" BIGINT NOT NULL DEFAULT 0,
    "avgPriceBps" INTEGER NOT NULL DEFAULT 0,
    "feeMicros" BIGINT NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "execution_intents_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "execution_batches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "execution_intents_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "execution_slices" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "submittedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "execution_slices_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "execution_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_reputation" (
    "walletAddress" TEXT NOT NULL PRIMARY KEY,
    "totalPredictions" INTEGER NOT NULL DEFAULT 0,
    "resolvedPredictions" INTEGER NOT NULL DEFAULT 0,
    "correctPredictions" INTEGER NOT NULL DEFAULT 0,
    "confidenceSumBps" BIGINT NOT NULL DEFAULT 0,
    "brierSumMicros" BIGINT NOT NULL DEFAULT 0,
    "notionalSumMicros" BIGINT NOT NULL DEFAULT 0,
    "pnlSumMicros" BIGINT NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "user_reputation_category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "totalPredictions" INTEGER NOT NULL DEFAULT 0,
    "resolvedPredictions" INTEGER NOT NULL DEFAULT 0,
    "correctPredictions" INTEGER NOT NULL DEFAULT 0,
    "confidenceSumBps" BIGINT NOT NULL DEFAULT 0,
    "brierSumMicros" BIGINT NOT NULL DEFAULT 0,
    "notionalSumMicros" BIGINT NOT NULL DEFAULT 0,
    "pnlSumMicros" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_reputation_category_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "user_reputation" ("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "calibration_bins" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "binIndex" INTEGER NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "sumConfidenceBps" BIGINT NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "calibration_bins_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "user_reputation" ("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "prediction_scores" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "resolvedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prediction_scores_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "prediction_scores_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "user_reputation" ("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "reputation_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "marketId" TEXT NOT NULL,
    "resolvedOutcome" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" DATETIME,
    "processedAt" DATETIME
);

-- CreateTable
CREATE TABLE "reputation_opens" (
    "predictionId" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "conviction_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "marketId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "participants" INTEGER NOT NULL,
    "capitalMicros" BIGINT NOT NULL,
    "averageConfidenceBps" INTEGER,
    "capitalWeightedConfidenceBps" INTEGER,
    "convictionBps" INTEGER,
    "polymarketProbabilityBps" INTEGER NOT NULL,
    "divergenceBps" INTEGER,
    "distributionJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conviction_snapshots_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "auth_nonces" (
    "nonce" TEXT NOT NULL PRIMARY KEY,
    "walletAddress" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
CREATE INDEX "auth_nonces_expiresAt_idx" ON "auth_nonces"("expiresAt");

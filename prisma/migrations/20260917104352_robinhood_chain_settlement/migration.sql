-- CreateTable
CREATE TABLE "chain_settlements" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "nextAttemptAt" DATETIME,
    "claimToken" TEXT,
    "claimedAt" DATETIME,
    "submittedAt" DATETIME,
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "chain_settlements_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "chain_settlements_chain_valid" CHECK (("chainId" = 46630 AND "network" = 'testnet') OR ("chainId" = 4663 AND "network" = 'mainnet')),
    CONSTRAINT "chain_settlements_status_valid" CHECK ("status" IN ('queued', 'signing', 'signed', 'submitted', 'confirmed', 'reverted', 'failed')),
    -- A settlement can only be confirmed or reverted from a mined receipt.
    CONSTRAINT "chain_settlements_receipt_required" CHECK ("status" NOT IN ('confirmed', 'reverted') OR ("txHash" IS NOT NULL AND "blockNumber" IS NOT NULL)),
    CONSTRAINT "chain_settlements_tx_required" CHECK ("status" NOT IN ('signed', 'submitted') OR ("txHash" IS NOT NULL AND "rawTx" IS NOT NULL AND "nonce" IS NOT NULL))
);

-- CreateIndex
CREATE UNIQUE INDEX "chain_settlements_txHash_key" ON "chain_settlements"("txHash");

-- CreateIndex
CREATE INDEX "chain_settlements_status_nextAttemptAt_idx" ON "chain_settlements"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "chain_settlements_predictionId_chainId_kind_key" ON "chain_settlements"("predictionId", "chainId", "kind");

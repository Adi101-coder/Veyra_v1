-- CreateTable
CREATE TABLE "pool_liquidity" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "bMicros" BIGINT NOT NULL,
    "allocatedMicros" BIGINT NOT NULL,
    "roundId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "feeBps" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "pool_liquidity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidity_fund_entries" (
    "id" TEXT NOT NULL,
    "deltaMicros" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liquidity_fund_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pool_liquidity_marketId_key" ON "pool_liquidity"("marketId");

-- CreateIndex
CREATE INDEX "pool_liquidity_status_idx" ON "pool_liquidity"("status");

-- CreateIndex
CREATE INDEX "liquidity_fund_entries_createdAt_idx" ON "liquidity_fund_entries"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "liquidity_fund_entries_refType_refId_kind_key" ON "liquidity_fund_entries"("refType", "refId", "kind");


-- Constraints Prisma's schema language cannot express.

ALTER TABLE "pool_liquidity" ADD CONSTRAINT "pool_liquidity_positive_check"
  CHECK ("bMicros" > 0 AND "allocatedMicros" > 0 AND "feeBps" >= 0 AND "feeBps" <= 10000);
ALTER TABLE "pool_liquidity" ADD CONSTRAINT "pool_liquidity_status_check"
  CHECK ("status" IN ('ACTIVE', 'CLOSED'));
ALTER TABLE "liquidity_fund_entries" ADD CONSTRAINT "liquidity_fund_kind_check"
  CHECK ("kind" IN ('SEED', 'FEE', 'ALLOCATION', 'RELEASE', 'LOSS'));

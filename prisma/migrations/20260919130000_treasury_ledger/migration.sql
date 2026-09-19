-- CreateTable
CREATE TABLE "treasury_deposits" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "amountBase" BIGINT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREDITED',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treasury_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treasury_ledger_entries" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "deltaBase" BIGINT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treasury_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treasury_balances" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "balanceBase" BIGINT NOT NULL DEFAULT 0,
    "decimals" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treasury_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treasury_deposits_walletAddress_asset_idx" ON "treasury_deposits"("walletAddress", "asset");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_deposits_chainId_txHash_logIndex_key" ON "treasury_deposits"("chainId", "txHash", "logIndex");

-- CreateIndex
CREATE INDEX "treasury_ledger_entries_walletAddress_asset_createdAt_idx" ON "treasury_ledger_entries"("walletAddress", "asset", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_ledger_entries_refType_refId_kind_key" ON "treasury_ledger_entries"("refType", "refId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_balances_walletAddress_asset_key" ON "treasury_balances"("walletAddress", "asset");


-- Constraints Prisma's schema language cannot express.

ALTER TABLE "treasury_deposits" ADD CONSTRAINT "treasury_deposits_amount_check"
  CHECK ("amountBase" > 0 AND "decimals" >= 0 AND "decimals" <= 36);
ALTER TABLE "treasury_deposits" ADD CONSTRAINT "treasury_deposits_status_check"
  CHECK ("status" IN ('PENDING', 'CREDITED', 'REJECTED'));
ALTER TABLE "treasury_ledger_entries" ADD CONSTRAINT "treasury_ledger_kind_check"
  CHECK ("kind" IN ('DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT'));
-- A user's custodial balance can never go negative.
ALTER TABLE "treasury_balances" ADD CONSTRAINT "treasury_balances_non_negative_check"
  CHECK ("balanceBase" >= 0);

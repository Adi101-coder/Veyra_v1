-- AlterTable
ALTER TABLE "Market" ADD COLUMN "payoutsAuthorizedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "treasury_withdrawals" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "destAddress" TEXT NOT NULL,
    "asset" TEXT NOT NULL DEFAULT 'USDC',
    "amountMicros" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "txHash" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "treasury_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treasury_withdrawals_status_createdAt_idx" ON "treasury_withdrawals"("status", "createdAt");

-- CreateIndex
CREATE INDEX "treasury_withdrawals_walletAddress_createdAt_idx" ON "treasury_withdrawals"("walletAddress", "createdAt");

ALTER TABLE "treasury_withdrawals" ADD CONSTRAINT "treasury_withdrawals_amount_check"
  CHECK ("amountMicros" > 0);
ALTER TABLE "treasury_withdrawals" ADD CONSTRAINT "treasury_withdrawals_status_check"
  CHECK ("status" IN ('PENDING', 'COMPLETED', 'FAILED'));

-- Reorged deposits need a reversal status.
ALTER TABLE "treasury_deposits" DROP CONSTRAINT IF EXISTS "treasury_deposits_status_check";
ALTER TABLE "treasury_deposits" ADD CONSTRAINT "treasury_deposits_status_check"
  CHECK ("status" IN ('PENDING', 'CREDITED', 'REJECTED', 'REVERSED'));

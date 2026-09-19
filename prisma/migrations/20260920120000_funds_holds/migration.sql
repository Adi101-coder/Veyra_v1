-- CreateTable
CREATE TABLE "funds_holds" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "amountMicros" BIGINT NOT NULL,
    "spentMicros" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "funds_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "funds_holds_executionId_key" ON "funds_holds"("executionId");

-- CreateIndex
CREATE INDEX "funds_holds_walletAddress_status_idx" ON "funds_holds"("walletAddress", "status");

-- CreateIndex
CREATE INDEX "funds_holds_status_idx" ON "funds_holds"("status");


-- Constraints Prisma's schema language cannot express.

ALTER TABLE "funds_holds" ADD CONSTRAINT "funds_holds_amounts_check"
  CHECK ("amountMicros" > 0 AND "spentMicros" >= 0 AND "spentMicros" <= "amountMicros");
ALTER TABLE "funds_holds" ADD CONSTRAINT "funds_holds_status_check"
  CHECK ("status" IN ('ACTIVE', 'SETTLED', 'RELEASED'));

-- Cash ledger kinds. HOLD debits at order time; HOLD_RELEASE returns the unspent
-- remainder. PAYOUT and FEE_DEBIT settle a resolved position.
ALTER TABLE "treasury_ledger_entries" DROP CONSTRAINT IF EXISTS "treasury_ledger_kind_check";
ALTER TABLE "treasury_ledger_entries" ADD CONSTRAINT "treasury_ledger_kind_check"
  CHECK ("kind" IN ('DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT', 'HOLD', 'HOLD_RELEASE',
                    'SELL_CREDIT', 'PAYOUT', 'FEE_DEBIT', 'REVERSAL'));

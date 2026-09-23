-- AlterTable
ALTER TABLE "treasury_withdrawals" ADD COLUMN     "payoutFrom" TEXT,
ADD COLUMN     "payoutNonce" INTEGER,
ADD COLUMN     "payoutRawTx" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "manualOnly" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "treasury_withdrawals" DROP CONSTRAINT "treasury_withdrawals_status_check";
ALTER TABLE "treasury_withdrawals" ADD CONSTRAINT "treasury_withdrawals_status_check"
  CHECK ("status" IN ('PENDING', 'SENDING', 'COMPLETED', 'FAILED'));

-- A SENDING row must carry the exact signed transaction it will rebroadcast.
ALTER TABLE "treasury_withdrawals" ADD CONSTRAINT "treasury_withdrawals_sending_signed_check"
  CHECK ("status" <> 'SENDING' OR ("payoutRawTx" IS NOT NULL AND "txHash" IS NOT NULL AND "payoutNonce" IS NOT NULL AND "payoutFrom" IS NOT NULL));

-- At most one automatic payout in flight: the hot wallet's nonces must never collide.
CREATE UNIQUE INDEX "treasury_withdrawals_one_sending" ON "treasury_withdrawals" ("status") WHERE "status" = 'SENDING';

-- AlterTable
ALTER TABLE "treasury_deposits" ADD COLUMN     "unrecoveredMicros" BIGINT NOT NULL DEFAULT 0;


ALTER TABLE "treasury_deposits" ADD CONSTRAINT "treasury_deposits_unrecovered_check"
  CHECK ("unrecoveredMicros" >= 0 AND "unrecoveredMicros" <= "amountBase");

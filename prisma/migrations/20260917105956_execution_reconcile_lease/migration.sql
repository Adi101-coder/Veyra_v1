-- AlterTable
ALTER TABLE "execution_batches" ADD COLUMN "reconcileClaimedAt" DATETIME;
ALTER TABLE "execution_batches" ADD COLUMN "reconcileToken" TEXT;

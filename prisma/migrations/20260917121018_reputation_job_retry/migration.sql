-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_reputation_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "marketId" TEXT NOT NULL,
    "resolvedOutcome" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" DATETIME,
    "processedAt" DATETIME
);
INSERT INTO "new_reputation_jobs" ("claimedAt", "createdAt", "errorMessage", "id", "marketId", "processedAt", "resolvedOutcome", "status") SELECT "claimedAt", "createdAt", "errorMessage", "id", "marketId", "processedAt", "resolvedOutcome", "status" FROM "reputation_jobs";
DROP TABLE "reputation_jobs";
ALTER TABLE "new_reputation_jobs" RENAME TO "reputation_jobs";
CREATE UNIQUE INDEX "reputation_jobs_marketId_key" ON "reputation_jobs"("marketId");
CREATE INDEX "reputation_jobs_status_createdAt_idx" ON "reputation_jobs"("status", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

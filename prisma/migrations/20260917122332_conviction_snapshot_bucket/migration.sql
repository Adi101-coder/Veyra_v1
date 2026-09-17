-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_conviction_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "marketId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "participants" INTEGER NOT NULL,
    "capitalMicros" BIGINT NOT NULL,
    "averageConfidenceBps" INTEGER,
    "capitalWeightedConfidenceBps" INTEGER,
    "convictionBps" INTEGER,
    "polymarketProbabilityBps" INTEGER,
    "divergenceBps" INTEGER,
    "distributionJson" TEXT NOT NULL,
    "inputsHash" TEXT,
    "bucketStart" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conviction_snapshots_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_conviction_snapshots" ("averageConfidenceBps", "capitalMicros", "capitalWeightedConfidenceBps", "convictionBps", "createdAt", "distributionJson", "divergenceBps", "engineVersion", "id", "marketId", "participants", "polymarketProbabilityBps") SELECT "averageConfidenceBps", "capitalMicros", "capitalWeightedConfidenceBps", "convictionBps", "createdAt", "distributionJson", "divergenceBps", "engineVersion", "id", "marketId", "participants", "polymarketProbabilityBps" FROM "conviction_snapshots";
DROP TABLE "conviction_snapshots";
ALTER TABLE "new_conviction_snapshots" RENAME TO "conviction_snapshots";
CREATE INDEX "conviction_snapshots_marketId_createdAt_idx" ON "conviction_snapshots"("marketId", "createdAt");
CREATE UNIQUE INDEX "conviction_snapshots_marketId_bucketStart_key" ON "conviction_snapshots"("marketId", "bucketStart");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

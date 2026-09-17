-- CreateTable
CREATE TABLE "job_leases" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "leaseUntil" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "inventory_reconciliation_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "tradesSince" DATETIME,
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "fingerprint" TEXT,
    "summaryJson" TEXT,
    "errorMessage" TEXT
);

-- CreateTable
CREATE TABLE "inventory_findings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "tokenId" TEXT,
    "predictionId" TEXT,
    "executionId" TEXT,
    "venueTradeId" TEXT,
    "expected" TEXT,
    "actual" TEXT,
    "detailJson" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    CONSTRAINT "inventory_findings_runId_fkey" FOREIGN KEY ("runId") REFERENCES "inventory_reconciliation_runs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "inventory_reconciliation_runs_startedAt_idx" ON "inventory_reconciliation_runs"("startedAt");

-- CreateIndex
CREATE INDEX "inventory_findings_runId_severity_idx" ON "inventory_findings"("runId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_findings_runId_fingerprint_key" ON "inventory_findings"("runId", "fingerprint");

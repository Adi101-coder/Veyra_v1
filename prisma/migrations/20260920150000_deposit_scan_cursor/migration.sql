-- CreateTable
CREATE TABLE "deposit_scan_cursors" (
    "chainId" INTEGER NOT NULL,
    "lastScannedBlock" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_scan_cursors_pkey" PRIMARY KEY ("chainId")
);


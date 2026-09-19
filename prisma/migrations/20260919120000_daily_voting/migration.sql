-- CreateTable
CREATE TABLE "voting_rounds" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "opensAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "selectionCount" INTEGER NOT NULL DEFAULT 5,
    "votesPerWallet" INTEGER NOT NULL DEFAULT 3,
    "closedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voting_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_proposals" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "resolvesAt" TEXT,
    "proposerWallet" TEXT NOT NULL,
    "marketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vote_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voting_round_results" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "voteCount" INTEGER NOT NULL,
    "selected" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voting_round_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "voting_rounds_status_closesAt_idx" ON "voting_rounds"("status", "closesAt");

-- CreateIndex
CREATE INDEX "vote_proposals_roundId_createdAt_idx" ON "vote_proposals"("roundId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "vote_proposals_roundId_normalizedTitle_key" ON "vote_proposals"("roundId", "normalizedTitle");

-- CreateIndex
CREATE INDEX "votes_proposalId_idx" ON "votes"("proposalId");

-- CreateIndex
CREATE INDEX "votes_roundId_walletAddress_idx" ON "votes"("roundId", "walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "votes_roundId_walletAddress_proposalId_key" ON "votes"("roundId", "walletAddress", "proposalId");

-- CreateIndex
CREATE INDEX "voting_round_results_roundId_rank_idx" ON "voting_round_results"("roundId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "voting_round_results_roundId_proposalId_key" ON "voting_round_results"("roundId", "proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "voting_round_results_roundId_rank_key" ON "voting_round_results"("roundId", "rank");

-- AddForeignKey
ALTER TABLE "vote_proposals" ADD CONSTRAINT "vote_proposals_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "voting_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "voting_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "vote_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voting_round_results" ADD CONSTRAINT "voting_round_results_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "voting_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voting_round_results" ADD CONSTRAINT "voting_round_results_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "vote_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Constraints Prisma's schema language cannot express.

-- At most one OPEN round at a time. This is what makes "open a round if none is
-- open" safe for concurrent workers without a lease: the loser gets a unique
-- violation instead of creating a second round.
CREATE UNIQUE INDEX "voting_round_single_open" ON "voting_rounds" ("status") WHERE "status" = 'OPEN';

ALTER TABLE "voting_rounds" ADD CONSTRAINT "voting_rounds_status_check"
  CHECK ("status" IN ('OPEN', 'CLOSED', 'FINALIZED'));
ALTER TABLE "voting_rounds" ADD CONSTRAINT "voting_rounds_window_check"
  CHECK ("closesAt" > "opensAt");
ALTER TABLE "voting_rounds" ADD CONSTRAINT "voting_rounds_selection_check"
  CHECK ("selectionCount" > 0 AND "votesPerWallet" > 0);
ALTER TABLE "voting_round_results" ADD CONSTRAINT "voting_round_results_rank_check"
  CHECK ("rank" > 0 AND "voteCount" >= 0);

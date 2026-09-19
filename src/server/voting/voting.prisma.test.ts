import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDatabase } from "@/server/testing/db";
import { loadVotingConfig, poolIdForProposal, type VotingConfig } from "@/server/voting/config";
import {
  closeDueRounds,
  createPoolsForRound,
  finalizeClosedRounds,
  freezeResults,
  runVotingTick,
} from "@/server/voting/lifecycle";
import { castVote, openRound, submitProposal } from "@/server/voting/store";
import { getPoolMarket, listPoolMarkets, poolSyntheticBook } from "@/server/voting/pool";
import { openPoolLiquidity, seedFund } from "@/server/pools/fund";
import { resolveMarket } from "@/server/betting/service";
import { getMarket } from "@/lib/markets";

let prisma: PrismaClient;
let database: ReturnType<typeof createTestDatabase>;

const CONFIG: VotingConfig = {
  ...loadVotingConfig({} as NodeJS.ProcessEnv),
  roundMs: 24 * 60 * 60 * 1000,
  selectionCount: 5,
  votesPerWallet: 3,
  proposalsPerWallet: 10,
};

const wallet = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;

beforeAll(() => {
  database = createTestDatabase("voting");
  prisma = database.prisma;
}, 120_000);

afterAll(async () => {
  await database?.drop();
});

beforeEach(async () => {
  await prisma.votingRoundResult.deleteMany();
  await prisma.vote.deleteMany();
  await prisma.voteProposal.deleteMany();
  await prisma.votingRound.deleteMany();
  await prisma.market.deleteMany({ where: { source: "veyra" } });
  await prisma.poolLiquidity.deleteMany();
  await prisma.liquidityFundEntry.deleteMany();
});

async function roundWithProposals(count: number, now = new Date()) {
  const { round } = await openRound(prisma, CONFIG, now);
  const proposals = [];
  for (let i = 0; i < count; i += 1) {
    proposals.push(
      await submitProposal(
        prisma,
        {
          roundId: round.id,
          title: `Question ${i}`,
          category: "crypto",
          tag: "community",
          proposerWallet: wallet(900 + i),
        },
        CONFIG,
        now,
      ),
    );
  }
  return { round, proposals };
}

describe("Daily voting rounds (Prisma)", () => {
  it("opens exactly one round even when many workers start at once", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => openRound(prisma, CONFIG, new Date())),
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await prisma.votingRound.count({ where: { status: "OPEN" } })).toBe(1);
    // Everyone sees the same round.
    expect(new Set(results.map((r) => r.round.id)).size).toBe(1);
  });

  it("counts one vote per wallet per proposal and enforces the per-round budget", async () => {
    const { round, proposals } = await roundWithProposals(5);
    const voter = wallet(1);

    const first = await castVote(prisma, { roundId: round.id, proposalId: proposals[0]!.id, walletAddress: voter });
    expect(first).toMatchObject({ recorded: true, votesUsed: 1, votesRemaining: 2 });

    // Replaying the same vote is idempotent and does not consume a second unit.
    const replay = await castVote(prisma, { roundId: round.id, proposalId: proposals[0]!.id, walletAddress: voter });
    expect(replay).toMatchObject({ recorded: false, votesUsed: 1, votesRemaining: 2 });

    await castVote(prisma, { roundId: round.id, proposalId: proposals[1]!.id, walletAddress: voter });
    await castVote(prisma, { roundId: round.id, proposalId: proposals[2]!.id, walletAddress: voter });
    await expect(
      castVote(prisma, { roundId: round.id, proposalId: proposals[3]!.id, walletAddress: voter }),
    ).rejects.toMatchObject({ code: "VOTE_LIMIT" });

    expect(await prisma.vote.count({ where: { roundId: round.id, walletAddress: voter } })).toBe(3);
  });

  it("never lets concurrent votes exceed the budget", async () => {
    // The budget is a count check, which races. Without the round-row lock two
    // concurrent votes both read used = N-1 and both commit.
    const { round, proposals } = await roundWithProposals(8);
    const voter = wallet(2);

    const attempts = await Promise.allSettled(
      proposals.map((p) => castVote(prisma, { roundId: round.id, proposalId: p.id, walletAddress: voter })),
    );
    const accepted = attempts.filter((a) => a.status === "fulfilled" && a.value.recorded);
    expect(accepted).toHaveLength(CONFIG.votesPerWallet);
    expect(await prisma.vote.count({ where: { roundId: round.id, walletAddress: voter } })).toBe(
      CONFIG.votesPerWallet,
    );
    for (const attempt of attempts) {
      if (attempt.status === "rejected") expect(attempt.reason).toMatchObject({ code: "VOTE_LIMIT" });
    }
  });

  it("records concurrent votes from different wallets exactly once each", async () => {
    const { round, proposals } = await roundWithProposals(2);
    const voters = Array.from({ length: 12 }, (_, i) => wallet(100 + i));

    await Promise.all(
      voters.map((v) => castVote(prisma, { roundId: round.id, proposalId: proposals[0]!.id, walletAddress: v })),
    );
    expect(await prisma.vote.count({ where: { proposalId: proposals[0]!.id } })).toBe(voters.length);
  });

  it("rejects duplicate proposals and votes on proposals from another round", async () => {
    const { round, proposals } = await roundWithProposals(1);
    await expect(
      submitProposal(
        prisma,
        { roundId: round.id, title: "  question 0  ", category: "crypto", tag: "t", proposerWallet: wallet(5) },
        CONFIG,
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_PROPOSAL" });

    const other = await prisma.votingRound.create({
      data: { status: "CLOSED", closesAt: new Date(Date.now() + 1000) },
    });
    await expect(
      castVote(prisma, { roundId: other.id, proposalId: proposals[0]!.id, walletAddress: wallet(6) }),
    ).rejects.toMatchObject({ code: "ROUND_CLOSED" });
  });

  it("freezes the result at close and refuses votes afterwards", async () => {
    const opened = new Date("2026-09-18T00:00:00Z");
    const { round, proposals } = await roundWithProposals(3, opened);
    await castVote(prisma, { roundId: round.id, proposalId: proposals[0]!.id, walletAddress: wallet(1) }, opened);

    const afterClose = new Date(opened.getTime() + CONFIG.roundMs + 1000);
    expect(await closeDueRounds(prisma, afterClose)).toBe(1);

    const stored = await prisma.votingRound.findUniqueOrThrow({ where: { id: round.id } });
    expect(stored.status).toBe("CLOSED");
    expect(await prisma.votingRoundResult.count({ where: { roundId: round.id } })).toBe(3);

    await expect(
      castVote(prisma, { roundId: round.id, proposalId: proposals[1]!.id, walletAddress: wallet(7) }, afterClose),
    ).rejects.toMatchObject({ code: "ROUND_CLOSED" });

    // Votes inserted by any other means must not change the frozen tally. Two of
    // them land on the runner-up, which WOULD overtake the winner if the result
    // were ever recomputed from raw votes.
    await prisma.vote.createMany({
      data: [
        { roundId: round.id, proposalId: proposals[1]!.id, walletAddress: wallet(8) },
        { roundId: round.id, proposalId: proposals[1]!.id, walletAddress: wallet(9) },
      ],
    });
    await freezeResults(prisma, round.id);
    const winner = await prisma.votingRoundResult.findFirstOrThrow({
      where: { roundId: round.id, rank: 1 },
    });
    expect(winner.proposalId).toBe(proposals[0]!.id);
    expect(winner.voteCount).toBe(1);
    const runnerUp = await prisma.votingRoundResult.findFirstOrThrow({
      where: { roundId: round.id, proposalId: proposals[1]!.id },
    });
    expect(runnerUp.voteCount).toBe(0);
  });

  it("breaks ties by submission order, deterministically", async () => {
    const opened = new Date("2026-09-18T00:00:00Z");
    const { round } = await openRound(prisma, CONFIG, opened);
    const made: { id: string; createdAt: Date }[] = [];
    for (let i = 0; i < 4; i += 1) {
      made.push(
        await prisma.voteProposal.create({
          data: {
            roundId: round.id,
            title: `Tie ${i}`,
            normalizedTitle: `tie ${i}`,
            category: "crypto",
            tag: "t",
            proposerWallet: wallet(10 + i),
            // Explicit, increasing submission times.
            createdAt: new Date(opened.getTime() + i * 1000),
          },
        }),
      );
    }
    // Every proposal gets exactly one vote: a four-way tie.
    for (const p of made) {
      await castVote(prisma, { roundId: round.id, proposalId: p.id, walletAddress: wallet(50) }, opened).catch(
        async () => {
          await prisma.vote.create({
            data: { roundId: round.id, proposalId: p.id, walletAddress: wallet(50 + made.indexOf(p)) },
          });
        },
      );
    }

    await closeDueRounds(prisma, new Date(opened.getTime() + CONFIG.roundMs + 1));
    const results = await prisma.votingRoundResult.findMany({
      where: { roundId: round.id },
      orderBy: { rank: "asc" },
    });
    expect(results.map((r) => r.proposalId)).toEqual(made.map((p) => p.id));
  });

  it("creates one pool per winner and is safe to finalize twice", async () => {
    const opened = new Date("2026-09-18T00:00:00Z");
    const { round, proposals } = await roundWithProposals(7, opened);
    // Give descending vote counts so the top 5 are unambiguous.
    for (let i = 0; i < proposals.length; i += 1) {
      for (let v = 0; v < proposals.length - i; v += 1) {
        await prisma.vote.create({
          data: { roundId: round.id, proposalId: proposals[i]!.id, walletAddress: wallet(200 + i * 20 + v) },
        });
      }
    }

    const after = new Date(opened.getTime() + CONFIG.roundMs + 1);
    await closeDueRounds(prisma, after);
    expect(await finalizeClosedRounds(prisma, CONFIG, after)).toBe(1);

    const pools = await prisma.market.findMany({ where: { source: "veyra" }, orderBy: { id: "asc" } });
    expect(pools).toHaveLength(CONFIG.selectionCount);
    expect(pools.every((p) => p.clobTokenYes === null && p.clobTokenNo === null)).toBe(true);
    expect(new Set(pools.map((p) => p.id))).toEqual(
      new Set(proposals.slice(0, 5).map((p) => poolIdForProposal(p.id))),
    );

    // Re-running finalization changes nothing.
    expect(await finalizeClosedRounds(prisma, CONFIG, after)).toBe(0);
    await createPoolsForRound(prisma, round.id, CONFIG);
    expect(await prisma.market.count({ where: { source: "veyra" } })).toBe(CONFIG.selectionCount);
    const stored = await prisma.votingRound.findUniqueOrThrow({ where: { id: round.id } });
    expect(stored.status).toBe("FINALIZED");
  });

  it("makes every created pool reachable, not just present in the table", async () => {
    const opened = new Date("2026-09-18T00:00:00Z");
    const { round, proposals } = await roundWithProposals(2, opened);
    await prisma.vote.create({
      data: { roundId: round.id, proposalId: proposals[0]!.id, walletAddress: wallet(31) },
    });
    await runVotingTick(prisma, CONFIG, new Date(opened.getTime() + CONFIG.roundMs + 1));

    const poolId = poolIdForProposal(proposals[0]!.id);
    // The static catalog does not know this pool: only the database lookup does.
    expect(getMarket(poolId)).toBeNull();

    const pool = await getPoolMarket(poolId, prisma);
    expect(pool).not.toBeNull();
    expect(pool!.title).toBe(proposals[0]!.title);
    expect(pool!.source).toBe("veyra");
    // Real category and a YES/NO pair, so the pool can actually be rendered.
    expect(pool!.seats.map((s) => s.side)).toEqual(["lands", "misses"]);
    expect(pool!.accent).toMatch(/^#/);

    // ...and the path the app uses to resolve a market by id finds it.
    const resolved = await resolveMarket(poolId, {
      store: null as never,
      executor: null as never,
      getCatalogMarket: getMarket,
      getPoolMarket: (id) => getPoolMarket(id, prisma),
      getLiveMarket: async () => null,
      getBook: async () => {
        throw new Error("a Veyra pool must not reach the venue book");
      },
    });
    expect(resolved?.id).toBe(poolId);
    expect(resolved?.clobTokenIds ?? []).toEqual([]);

    expect((await listPoolMarkets(prisma)).map((m) => m.id)).toEqual([poolId]);

    // With an empty liquidity fund the pool has no counterparty, so it must refuse
    // to quote rather than show an invented price.
    expect(await poolSyntheticBook(`synthetic:${poolId}:YES`, prisma)).toBeNull();

    // Funded, it quotes its own AMM curve.
    await seedFund(prisma, 1_000_000_000n, `test-seed-${poolId}`);
    await openPoolLiquidity(prisma, poolId, round.id);
    const book = await poolSyntheticBook(`synthetic:${poolId}:YES`, prisma);
    expect(book).not.toBeNull();
    expect(book!.asks.length).toBeGreaterThan(0);
    expect(book!.source).not.toBe("polymarket");
    // A fresh pool prices both sides at even odds.
    expect(book!.lastTradePrice).toBe("0.5000");

    expect(await poolSyntheticBook(`synthetic:not-a-pool:YES`, prisma)).toBeNull();
    expect(await poolSyntheticBook("0xnotsynthetic", prisma)).toBeNull();
  });

  it("finishes a round left CLOSED by a crashed worker", async () => {
    const opened = new Date("2026-09-18T00:00:00Z");
    const { round, proposals } = await roundWithProposals(3, opened);
    await prisma.vote.create({
      data: { roundId: round.id, proposalId: proposals[0]!.id, walletAddress: wallet(3) },
    });

    const after = new Date(opened.getTime() + CONFIG.roundMs + 1);
    // Simulate a crash straight after the status claim: CLOSED, no results, no pools.
    await prisma.votingRound.updateMany({
      where: { id: round.id, status: "OPEN" },
      data: { status: "CLOSED", closedAt: after },
    });
    expect(await prisma.votingRoundResult.count({ where: { roundId: round.id } })).toBe(0);

    const tick = await runVotingTick(prisma, CONFIG, after);
    expect(tick.finalized).toBe(1);
    expect(await prisma.votingRoundResult.count({ where: { roundId: round.id } })).toBe(3);
    expect(await prisma.market.count({ where: { id: poolIdForProposal(proposals[0]!.id) } })).toBe(1);
    // ...and the next round is open.
    expect(await prisma.votingRound.count({ where: { status: "OPEN" } })).toBe(1);
  });

  it("closes and finalizes exactly once when several workers tick together", async () => {
    const opened = new Date("2026-09-18T00:00:00Z");
    const { round, proposals } = await roundWithProposals(6, opened);
    for (let i = 0; i < proposals.length; i += 1) {
      await prisma.vote.create({
        data: { roundId: round.id, proposalId: proposals[i]!.id, walletAddress: wallet(300 + i) },
      });
    }

    const after = new Date(opened.getTime() + CONFIG.roundMs + 1);
    const ticks = await Promise.all(Array.from({ length: 5 }, () => runVotingTick(prisma, CONFIG, after)));

    expect(ticks.reduce((sum, t) => sum + t.closed, 0)).toBe(1);
    expect(ticks.reduce((sum, t) => sum + t.finalized, 0)).toBe(1);
    expect(ticks.reduce((sum, t) => sum + t.opened, 0)).toBe(1);
    expect(await prisma.votingRoundResult.count({ where: { roundId: round.id } })).toBe(6);
    expect(await prisma.market.count({ where: { source: "veyra" } })).toBe(CONFIG.selectionCount);
    expect(await prisma.votingRound.count({ where: { status: "FINALIZED" } })).toBe(1);
    expect(await prisma.votingRound.count({ where: { status: "OPEN" } })).toBe(1);
  });

  it("selects nothing from a round nobody voted in", async () => {
    const opened = new Date("2026-09-18T00:00:00Z");
    const { round } = await roundWithProposals(3, opened);
    const after = new Date(opened.getTime() + CONFIG.roundMs + 1);
    await runVotingTick(prisma, CONFIG, after);

    const results = await prisma.votingRoundResult.findMany({ where: { roundId: round.id } });
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.selected === false)).toBe(true);
    expect(await prisma.market.count({ where: { source: "veyra" } })).toBe(0);
  });

  it("keeps the full voting history after finalization", async () => {
    const opened = new Date("2026-09-18T00:00:00Z");
    const { round, proposals } = await roundWithProposals(2, opened);
    const voter = wallet(11);
    await castVote(prisma, { roundId: round.id, proposalId: proposals[0]!.id, walletAddress: voter }, opened);

    await runVotingTick(prisma, CONFIG, new Date(opened.getTime() + CONFIG.roundMs + 1));

    // Individual votes survive: the selection can be re-audited from raw rows.
    const votes = await prisma.vote.findMany({ where: { roundId: round.id } });
    expect(votes).toHaveLength(1);
    expect(votes[0]).toMatchObject({ walletAddress: voter, proposalId: proposals[0]!.id });
    const proposal = await prisma.voteProposal.findUniqueOrThrow({ where: { id: proposals[0]!.id } });
    expect(proposal.marketId).toBe(poolIdForProposal(proposals[0]!.id));
  });
});

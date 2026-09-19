import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDatabase } from "@/server/testing/db";
import { auditBalances } from "@/server/treasury/ledger";
import {
  creditCash,
  releaseHold,
  reserveFunds,
} from "@/server/treasury/funds";
import { releaseTerminalHolds } from "@/server/treasury/holds";
import { creditSellFills } from "@/server/treasury/sells";
import { payoutResolvedPositions } from "@/server/treasury/payouts";
import { custodyIdentity, reconcileSolvency } from "@/server/treasury/solvency";

let prisma: PrismaClient;
let database: ReturnType<typeof createTestDatabase>;

const USD = 1_000_000n;
const WALLET = "0xcafe00000000000000000000000000000000000a";
const HOUSE = 10_000n * USD;
const previousCustody = process.env.VEYRA_CUSTODY_ENABLED;

beforeAll(() => {
  process.env.VEYRA_CUSTODY_ENABLED = "true";
  database = createTestDatabase("custody_inv");
  prisma = database.prisma;
}, 120_000);

afterAll(async () => {
  if (previousCustody == null) delete process.env.VEYRA_CUSTODY_ENABLED;
  else process.env.VEYRA_CUSTODY_ENABLED = previousCustody;
  await database?.drop();
});

beforeEach(async () => {
  await prisma.predictionScore.deleteMany();
  await prisma.userReputation.deleteMany();
  await prisma.fill.deleteMany();
  await prisma.fundsHold.deleteMany();
  await prisma.execution.deleteMany();
  await prisma.position.deleteMany();
  await prisma.prediction.deleteMany();
  await prisma.poolLiquidity.deleteMany();
  await prisma.market.deleteMany();
  await prisma.treasuryLedgerEntry.deleteMany();
  await prisma.treasuryBalance.deleteMany();
});

async function fund(amount: bigint, ref = `dep-${Math.random()}`) {
  await creditCash(prisma, {
    walletAddress: WALLET,
    amountMicros: amount,
    kind: "DEPOSIT",
    refType: "Test",
    refId: ref,
  });
}

async function seedMarket(id: string, source = "polymarket") {
  return prisma.market.create({
    data: { id, title: id, category: "crypto", tag: "t", status: "open", source },
  });
}

async function seedLiveOrder(input: {
  marketId: string;
  executionId?: string;
  side?: "BUY" | "SELL";
  status?: string;
  notional: bigint;
  reserve?: boolean;
}) {
  const marketId = input.marketId;
  const prediction = await prisma.prediction.create({
    data: {
      walletAddress: WALLET,
      marketId,
      outcome: "YES",
      confidenceBps: 6000,
      stakeMicros: input.notional,
      marketPriceBps: 5000,
      engineVersion: "test",
      engineInputJson: "{}",
      engineOutputJson: "{}",
      status: "accepted",
      position: {
        create: {
          marketId,
          walletAddress: WALLET,
          outcome: "YES",
          side: "BUY",
          tokenId: "tok",
          sharesMicros: 0n,
          limitPriceBps: 5000,
          avgPriceBps: 0,
          notionalMicros: 0n,
          payoutMicros: 0n,
          edgeBps: 0,
          kellyBps: 0,
          status: "pending",
          executions: {
            create: {
              id: input.executionId,
              venue: "polymarket",
              mode: "live",
              status: input.status ?? "submitted",
              tokenId: "tok",
              side: input.side ?? "BUY",
              orderType: "FAK",
              limitPriceBps: 5000,
              sizeSharesMicros: input.notional,
              notionalMicros: input.notional,
              requestJson: "{}",
            },
          },
        },
      },
    },
    include: { position: { include: { executions: true } } },
  });
  const execution = prediction.position!.executions[0]!;
  if (input.reserve !== false && (input.side ?? "BUY") === "BUY") {
    await prisma.$transaction((tx) =>
      reserveFunds(tx, { walletAddress: WALLET, executionId: execution.id, amountMicros: input.notional }),
    );
  }
  return { prediction, execution };
}

async function addFill(executionId: string, notional: bigint, fee = 0n, sideHint = "buy") {
  return prisma.fill.create({
    data: {
      executionId,
      venueTradeId: `t-${executionId}-${sideHint}-${Math.random()}`,
      priceBps: 5000,
      sharesMicros: notional,
      notionalMicros: notional,
      feeMicros: fee,
      isSimulated: false,
    },
  });
}

async function assertSolvent() {
  const audit = await auditBalances(prisma);
  expect(audit.discrepancies).toEqual([]);
  const identity = await custodyIdentity(prisma);
  expect(identity.balances).toBeGreaterThanOrEqual(0n);
  // Cash is conserved: spendable + open holds + filled cost equals deposits and
  // later credits, minus withdrawals and fees. SELL/PAYOUT are new USDC from the
  // venue, so they expand the pie rather than breaking it.
  expect(identity.balances + identity.activeHolds + identity.settledSpent).toBe(
    identity.deposits +
      identity.sellCredits +
      identity.payouts +
      identity.reversals -
      identity.withdrawals -
      identity.fees,
  );
  const sourced =
    identity.deposits + identity.sellCredits + identity.payouts + identity.reversals + HOUSE;
  const report = await reconcileSolvency(prisma, {
    VEYRA_HOUSE_CAPITAL_MICROS: HOUSE.toString(),
    VEYRA_CONTROLLED_USDC_MICROS: sourced.toString(),
  } as unknown as NodeJS.ProcessEnv);
  expect(report.ready).toBe(true);
}

describe("Custody cash loop", () => {
  it("releases the unspent remainder of a partial fill and is a no-op on retry", async () => {
    await fund(100n * USD);
    await seedMarket("m-partial");
    const { execution } = await seedLiveOrder({ marketId: "m-partial", notional: 40n * USD });
    await addFill(execution.id, 15n * USD, 1n * USD);
    await prisma.execution.update({ where: { id: execution.id }, data: { status: "partial" } });

    expect(await releaseTerminalHolds(prisma)).toEqual({ released: 1 });
    expect(await releaseTerminalHolds(prisma)).toEqual({ released: 0 });
    const hold = await prisma.fundsHold.findUniqueOrThrow({ where: { executionId: execution.id } });
    expect(hold.status).toBe("SETTLED");
    expect(hold.spentMicros).toBe(16n * USD);
  });

  it("returns the whole reservation when the order is rejected", async () => {
    await fund(50n * USD);
    await seedMarket("m-reject");
    const { execution } = await seedLiveOrder({ marketId: "m-reject", notional: 20n * USD });
    await prisma.execution.update({ where: { id: execution.id }, data: { status: "failed" } });
    await releaseTerminalHolds(prisma);
    expect((await prisma.treasuryBalance.findFirstOrThrow()).balanceBase).toBe(50n * USD);
  });

  it("credits SELL proceeds once per fill", async () => {
    await fund(100n * USD);
    await seedMarket("m-sell");
    const { execution } = await seedLiveOrder({
      marketId: "m-sell",
      side: "SELL",
      notional: 10n * USD,
      reserve: false,
      status: "filled",
    });
    const fill = await addFill(execution.id, 10n * USD, 1n * USD, "sell");
    expect(await creditSellFills(prisma)).toEqual({ credited: 1 });
    expect(await creditSellFills(prisma)).toEqual({ credited: 0 });
    const credit = await prisma.treasuryLedgerEntry.findFirst({
      where: { kind: "SELL_CREDIT", refId: fill.id },
    });
    expect(credit?.deltaBase).toBe(9n * USD);
  });

  it("pays a winning position from PredictionScore.payoutMicros and takes the pool fee from pnlMicros", async () => {
    await fund(100n * USD);
    await seedMarket("m-pay", "veyra");
    await prisma.poolLiquidity.create({
      data: {
        marketId: "m-pay",
        bMicros: 100n * USD,
        allocatedMicros: 70n * USD,
        status: "ACTIVE",
        feeBps: 200,
      },
    });
    await prisma.market.update({
      where: { id: "m-pay" },
      data: { resolvedAt: new Date(), payoutsAuthorizedAt: new Date(), source: "veyra" },
    });
    const { prediction, execution } = await seedLiveOrder({
      marketId: "m-pay",
      notional: 20n * USD,
      status: "filled",
    });
    await addFill(execution.id, 20n * USD);
    await prisma.position.update({
      where: { id: prediction.position!.id },
      data: { sharesMicros: 40n * USD, payoutMicros: 40n * USD },
    });
    await prisma.userReputation.create({ data: { walletAddress: WALLET } });
    await prisma.predictionScore.create({
      data: {
        predictionId: prediction.id,
        walletAddress: WALLET,
        marketId: "m-pay",
        category: "crypto",
        predictedOutcome: "YES",
        resolvedOutcome: "YES",
        confidenceBps: 6000,
        impliedYesBps: 6000,
        correct: true,
        brierMicros: 0n,
        notionalMicros: 20n * USD,
        payoutMicros: 40n * USD,
        pnlMicros: 20n * USD,
        resolvedAt: new Date(),
      },
    });

    const first = await payoutResolvedPositions(prisma);
    const second = await payoutResolvedPositions(prisma);
    expect(first.paid).toBe(1);
    expect(first.fees).toBe(1);
    expect(second).toEqual({ paid: 0, fees: 0 });
    // 100 - 20 reserve still active + 40 payout - 0.4 fee
    const fee = (20n * USD * 200n) / 10_000n;
    expect(fee).toBe(400_000n);
  });

  it("keeps solvency across random place / partial / reject / sell / resolve / retry", async () => {
    const deposits = 1_000n * USD;
    await fund(deposits, "seed-invariant");
    await assertSolvent();

    let seed = 42;
    const rand = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };

    for (let step = 0; step < 24; step += 1) {
      const roll = rand();
      if (roll < 0.25) {
        const marketId = `inv-place-${step}`;
        await seedMarket(marketId);
        const size = BigInt(5 + Math.floor(rand() * 20)) * USD;
        const available = (await prisma.treasuryBalance.findFirst())?.balanceBase ?? 0n;
        if (available < size) continue;
        const { execution } = await seedLiveOrder({ marketId, notional: size });
        const filled = rand() < 0.7;
        if (filled) {
          const spent = (size * BigInt(1 + Math.floor(rand() * 8))) / 10n;
          if (spent > 0n) await addFill(execution.id, spent);
          await prisma.execution.update({
            where: { id: execution.id },
            data: { status: spent === size ? "filled" : "partial" },
          });
        } else {
          await prisma.execution.update({ where: { id: execution.id }, data: { status: "failed" } });
        }
        await releaseTerminalHolds(prisma);
        await releaseTerminalHolds(prisma);
      } else if (roll < 0.5) {
        const marketId = `inv-sell-${step}`;
        await seedMarket(marketId);
        const proceeds = BigInt(1 + Math.floor(rand() * 8)) * USD;
        const { execution } = await seedLiveOrder({
          marketId,
          side: "SELL",
          notional: proceeds,
          reserve: false,
          status: "filled",
        });
        await addFill(execution.id, proceeds, 0n, "sell");
        await creditSellFills(prisma);
        await creditSellFills(prisma);
      } else if (roll < 0.75) {
        const marketId = `inv-win-${step}`;
        await seedMarket(marketId);
        const { prediction, execution } = await seedLiveOrder({
          marketId,
          notional: 10n * USD,
          status: "filled",
        });
        await addFill(execution.id, 10n * USD);
        await releaseTerminalHolds(prisma);
        await prisma.market.update({
          where: { id: marketId },
          data: { resolvedAt: new Date(), source: "polymarket" },
        });
        await prisma.userReputation.upsert({
          where: { walletAddress: WALLET },
          create: { walletAddress: WALLET },
          update: {},
        });
        await prisma.predictionScore.create({
          data: {
            predictionId: prediction.id,
            walletAddress: WALLET,
            marketId,
            category: "crypto",
            predictedOutcome: "YES",
            resolvedOutcome: "YES",
            confidenceBps: 6000,
            impliedYesBps: 6000,
            correct: true,
            brierMicros: 0n,
            notionalMicros: 10n * USD,
            payoutMicros: 10n * USD,
            pnlMicros: 0n,
            resolvedAt: new Date(),
          },
        });
        await payoutResolvedPositions(prisma);
        await payoutResolvedPositions(prisma);
      } else {
        await releaseHold(prisma, "missing", 0n);
        await releaseTerminalHolds(prisma);
      }
      await assertSolvent();
    }
  });
});

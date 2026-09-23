import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { keccak256, type Hex } from "viem";
import { createTestDatabase } from "@/server/testing/db";
import { CASH_ASSET, creditCash } from "@/server/treasury/funds";
import { processHotPayouts, type PayoutChain } from "@/server/treasury/hot-payouts";
import { completeWithdrawal, requestWithdrawal } from "@/server/treasury/withdrawals";

let prisma: PrismaClient;
let database: ReturnType<typeof createTestDatabase>;

const USER = "0xaaaa000000000000000000000000000000000001";
const DEST = "0x5555555555555555555555555555555555555555";
// Throwaway key used only in this test.
const PAYOUT_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ENV = {
  VEYRA_CUSTODY_ENABLED: "true",
  VEYRA_PAYOUT_PRIVATE_KEY: PAYOUT_KEY,
  VEYRA_PAYOUT_MAX_MICROS: "100000000",
  VEYRA_PAYOUT_DAILY_MAX_MICROS: "150000000",
};

type Fake = PayoutChain & {
  broadcasts: Hex[];
  receipts: Map<Hex, "success" | "reverted">;
  minedNonce: number;
  float: bigint;
  failBroadcast: boolean;
};

function fakeChain(): Fake {
  const fake: Fake = {
    chainId: 4663,
    token: "0x6666666666666666666666666666666666666666",
    broadcasts: [],
    receipts: new Map(),
    minedNonce: 0,
    float: 1_000_000_000n,
    failBroadcast: false,
    tokenBalance: async () => fake.float,
    nativeBalance: async () => 10n ** 18n,
    nonce: async (_address, tag) => (tag === "latest" ? fake.minedNonce : fake.minedNonce),
    estimateGas: async () => 60_000n,
    fees: async () => ({ maxFeePerGas: 1_000_000n, maxPriorityFeePerGas: 1_000n }),
    broadcast: async (raw) => {
      fake.broadcasts.push(raw);
      if (fake.failBroadcast) throw new Error("rpc down");
    },
    receipt: async (hash) => {
      const status = fake.receipts.get(hash);
      return status ? { status } : null;
    },
  };
  return fake;
}

const mine = (fake: Fake, raw: Hex, status: "success" | "reverted" = "success") => {
  fake.receipts.set(keccak256(raw), status);
  fake.minedNonce += 1;
};

async function withdraw(amountMicros: bigint) {
  return requestWithdrawal(prisma, { walletAddress: USER, destAddress: DEST, amountMicros });
}

async function balance() {
  const row = await prisma.treasuryBalance.findUnique({
    where: { walletAddress_asset: { walletAddress: USER, asset: CASH_ASSET } },
  });
  return row?.balanceBase ?? 0n;
}

beforeAll(() => {
  database = createTestDatabase("hot_payouts");
  prisma = database.prisma;
}, 120_000);

afterAll(async () => {
  await database?.drop();
});

beforeEach(async () => {
  await prisma.treasuryLedgerEntry.deleteMany();
  await prisma.treasuryBalance.deleteMany();
  await prisma.treasuryWithdrawal.deleteMany();
  await creditCash(prisma, { walletAddress: USER, amountMicros: 1_000_000_000n, kind: "DEPOSIT", refType: "Test", refId: "seed" });
});

describe("Hot-wallet payouts (Prisma)", () => {
  it("signs, persists, then broadcasts; completes once the receipt lands", async () => {
    const chain = fakeChain();
    const row = await withdraw(10_000_000n);

    const first = await processHotPayouts(prisma, ENV, { chain, decimals: 6 });
    expect(first.sent).toBe(1);
    const sending = await prisma.treasuryWithdrawal.findUniqueOrThrow({ where: { id: row.id } });
    expect(sending.status).toBe("SENDING");
    expect(sending.payoutNonce).toBe(0);
    expect(sending.txHash).toBe(keccak256(sending.payoutRawTx as Hex));
    expect(chain.broadcasts).toEqual([sending.payoutRawTx]);

    mine(chain, sending.payoutRawTx as Hex);
    const second = await processHotPayouts(prisma, ENV, { chain, decimals: 6 });
    expect(second.settled).toBe(1);
    expect((await prisma.treasuryWithdrawal.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("COMPLETED");
    expect(await balance()).toBe(990_000_000n);
  });

  it("after a failed broadcast only ever rebroadcasts the same signed bytes", async () => {
    const chain = fakeChain();
    const row = await withdraw(10_000_000n);
    chain.failBroadcast = true;
    await processHotPayouts(prisma, ENV, { chain, decimals: 6 });
    const persisted = await prisma.treasuryWithdrawal.findUniqueOrThrow({ where: { id: row.id } });
    expect(persisted.status).toBe("SENDING");

    chain.failBroadcast = false;
    const retry = await processHotPayouts(prisma, ENV, { chain, decimals: 6 });
    expect(retry.sent).toBe(0);
    expect(chain.broadcasts).toEqual([persisted.payoutRawTx, persisted.payoutRawTx]);
    const after = await prisma.treasuryWithdrawal.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.payoutRawTx).toBe(persisted.payoutRawTx);
    expect(after.payoutNonce).toBe(persisted.payoutNonce);
  });

  it("never signs a second payout while one is in flight", async () => {
    const chain = fakeChain();
    await withdraw(10_000_000n);
    const second = await withdraw(20_000_000n);
    await processHotPayouts(prisma, ENV, { chain, decimals: 6 });
    const tick = await processHotPayouts(prisma, ENV, { chain, decimals: 6 });
    expect(tick.sent).toBe(0);
    expect(await prisma.treasuryWithdrawal.count({ where: { status: "SENDING" } })).toBe(1);
    expect((await prisma.treasuryWithdrawal.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("PENDING");
    await expect(
      prisma.treasuryWithdrawal.update({
        where: { id: second.id },
        data: { status: "SENDING", payoutRawTx: "0x01", txHash: `0x${"01".repeat(32)}`, payoutNonce: 1, payoutFrom: DEST },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("a reverted payout goes to the operator queue with the user's money still debited", async () => {
    const chain = fakeChain();
    const row = await withdraw(10_000_000n);
    await processHotPayouts(prisma, ENV, { chain, decimals: 6 });
    const sending = await prisma.treasuryWithdrawal.findUniqueOrThrow({ where: { id: row.id } });
    mine(chain, sending.payoutRawTx as Hex, "reverted");
    await processHotPayouts(prisma, ENV, { chain, decimals: 6 });

    const after = await prisma.treasuryWithdrawal.findUniqueOrThrow({ where: { id: row.id } });
    expect(after).toMatchObject({ status: "PENDING", manualOnly: true, txHash: null, payoutRawTx: null });
    expect(after.errorMessage).toMatch(/reverted/);
    expect(await balance()).toBe(990_000_000n);
    // Not retried automatically.
    expect((await processHotPayouts(prisma, ENV, { chain, decimals: 6 })).sent).toBe(0);
  });

  it("a nonce used by another transaction is handed to the operator, not re-signed", async () => {
    const chain = fakeChain();
    const row = await withdraw(10_000_000n);
    await processHotPayouts(prisma, ENV, { chain, decimals: 6 });
    chain.minedNonce = 1;
    await processHotPayouts(prisma, ENV, { chain, decimals: 6 });
    const after = await prisma.treasuryWithdrawal.findUniqueOrThrow({ where: { id: row.id } });
    expect(after).toMatchObject({ status: "PENDING", manualOnly: true });
    expect(after.errorMessage).toMatch(/different transaction/);
  });

  it("sends nothing above the per-withdrawal cap and marks it manual", async () => {
    const chain = fakeChain();
    const row = await withdraw(100_000_001n);
    const result = await processHotPayouts(prisma, ENV, { chain, decimals: 6 });
    expect(result).toMatchObject({ sent: 0, manual: 1 });
    expect(chain.broadcasts).toEqual([]);
    expect((await prisma.treasuryWithdrawal.findUniqueOrThrow({ where: { id: row.id } })).manualOnly).toBe(true);
  });

  it("waits, in order, once the rolling daily cap is reached", async () => {
    const chain = fakeChain();
    const first = await withdraw(100_000_000n);
    await processHotPayouts(prisma, ENV, { chain, decimals: 6 });
    const sent = await prisma.treasuryWithdrawal.findUniqueOrThrow({ where: { id: first.id } });
    mine(chain, sent.payoutRawTx as Hex);
    await processHotPayouts(prisma, ENV, { chain, decimals: 6 });

    const next = await withdraw(60_000_000n);
    const blocked = await processHotPayouts(prisma, ENV, { chain, decimals: 6 });
    expect(blocked.sent).toBe(0);
    expect(blocked.waiting).toMatch(/Daily/);
    expect((await prisma.treasuryWithdrawal.findUniqueOrThrow({ where: { id: next.id } })).manualOnly).toBe(false);

    const tomorrow = new Date(Date.now() + 86_400_000 + 1_000);
    expect((await processHotPayouts(prisma, ENV, { chain, decimals: 6 }, tomorrow)).sent).toBe(1);
  });

  it("waits when the float cannot cover the next withdrawal", async () => {
    const chain = fakeChain();
    chain.float = 5_000_000n;
    await withdraw(10_000_000n);
    const result = await processHotPayouts(prisma, ENV, { chain, decimals: 6 });
    expect(result.sent).toBe(0);
    expect(result.waiting).toMatch(/float/);
  });

  it("scales micros to the token's decimals", async () => {
    const chain = fakeChain();
    chain.float = 10n ** 30n;
    const row = await withdraw(10_000_000n);
    await processHotPayouts(prisma, ENV, { chain, decimals: 18 });
    const sending = await prisma.treasuryWithdrawal.findUniqueOrThrow({ where: { id: row.id } });
    // transfer(address,uint256) amount is the last 32 bytes of calldata inside the signed tx.
    expect((sending.payoutRawTx as string).includes((10n * 10n ** 18n).toString(16).padStart(64, "0"))).toBe(true);
  });

  it("does nothing without a payout key or with custody off", async () => {
    const chain = fakeChain();
    await withdraw(10_000_000n);
    expect(await processHotPayouts(prisma, { ...ENV, VEYRA_PAYOUT_PRIVATE_KEY: "" }, { chain, decimals: 6 })).toMatchObject({ sent: 0 });
    expect(await processHotPayouts(prisma, { ...ENV, VEYRA_CUSTODY_ENABLED: "false" }, { chain, decimals: 6 })).toMatchObject({ sent: 0 });
    expect(chain.broadcasts).toEqual([]);
  });

  it("operators may only hand-complete rows marked manual while payouts are automatic", async () => {
    const auto = await withdraw(10_000_000n);
    const hash = `0x${"ab".repeat(32)}`;
    await expect(
      completeWithdrawal(prisma, { id: auto.id, txHash: hash }, ENV as unknown as NodeJS.ProcessEnv),
    ).rejects.toMatchObject({ code: "WITHDRAWAL_NOT_PENDING" });

    await prisma.treasuryWithdrawal.update({ where: { id: auto.id }, data: { manualOnly: true } });
    const done = await completeWithdrawal(prisma, { id: auto.id, txHash: hash }, ENV as unknown as NodeJS.ProcessEnv);
    expect(done.status).toBe("COMPLETED");
  });
});

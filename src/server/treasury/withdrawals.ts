import "server-only";

import type { PrismaClient } from "@prisma/client";
import { BettingError } from "@/server/errors";
import { CASH_ASSET, debitCash, creditCash } from "@/server/treasury/funds";

const EVM = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

export async function requestWithdrawal(
  prisma: PrismaClient,
  input: { walletAddress: string; destAddress: string; amountMicros: bigint },
) {
  const walletAddress = input.walletAddress.toLowerCase();
  const destAddress = input.destAddress.trim().toLowerCase();
  if (!EVM.test(destAddress)) {
    throw new BettingError("INVALID_WITHDRAWAL", "Destination must be an EVM address.", 400);
  }
  if (input.amountMicros <= 0n) {
    throw new BettingError("INVALID_WITHDRAWAL", "Withdrawal amount must be positive.", 400);
  }

  const withdrawal = await prisma.treasuryWithdrawal.create({
    data: {
      walletAddress,
      destAddress,
      asset: CASH_ASSET,
      amountMicros: input.amountMicros,
      status: "PENDING",
    },
  });

  try {
    await debitCash(prisma, {
      walletAddress,
      amountMicros: input.amountMicros,
      kind: "WITHDRAWAL",
      refType: "TreasuryWithdrawal",
      refId: withdrawal.id,
    });
  } catch (error) {
    await prisma.treasuryWithdrawal.delete({ where: { id: withdrawal.id } });
    throw error;
  }

  return withdrawal;
}

export async function listPendingWithdrawals(prisma: PrismaClient) {
  return prisma.treasuryWithdrawal.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
}

export async function completeWithdrawal(
  prisma: PrismaClient,
  input: { id: string; txHash: string },
) {
  if (!TX_HASH.test(input.txHash)) {
    throw new BettingError("INVALID_WITHDRAWAL", "txHash must be a 32-byte hex hash.", 400);
  }
  const claim = await prisma.treasuryWithdrawal.updateMany({
    where: { id: input.id, status: "PENDING" },
    data: { status: "COMPLETED", txHash: input.txHash.toLowerCase(), completedAt: new Date() },
  });
  if (claim.count !== 1) {
    throw new BettingError("WITHDRAWAL_NOT_PENDING", "That withdrawal is not waiting for an operator.", 409);
  }
  return prisma.treasuryWithdrawal.findUniqueOrThrow({ where: { id: input.id } });
}

export async function failWithdrawal(
  prisma: PrismaClient,
  input: { id: string; errorMessage?: string },
) {
  const current = await prisma.treasuryWithdrawal.findUnique({ where: { id: input.id } });
  if (!current || current.status !== "PENDING") {
    throw new BettingError("WITHDRAWAL_NOT_PENDING", "That withdrawal is not waiting for an operator.", 409);
  }
  await creditCash(prisma, {
    walletAddress: current.walletAddress,
    amountMicros: current.amountMicros,
    kind: "REVERSAL",
    refType: "TreasuryWithdrawal",
    refId: current.id,
  });
  const claim = await prisma.treasuryWithdrawal.updateMany({
    where: { id: current.id, status: "PENDING" },
    data: {
      status: "FAILED",
      errorMessage: input.errorMessage ?? "Operator rejected or transfer failed.",
      completedAt: new Date(),
    },
  });
  if (claim.count !== 1) {
    throw new BettingError("WITHDRAWAL_NOT_PENDING", "That withdrawal is not waiting for an operator.", 409);
  }
  return prisma.treasuryWithdrawal.findUniqueOrThrow({ where: { id: current.id } });
}

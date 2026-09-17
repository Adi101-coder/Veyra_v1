import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/**
 * Singleton job lease across processes. Acquire succeeds only if no unexpired lease
 * exists; a crashed holder's lease simply expires. Release/renew require the token.
 */
export async function acquireLease(prisma: PrismaClient, name: string, ttlMs: number, now = new Date()) {
  const token = randomUUID();
  const leaseUntil = new Date(now.getTime() + ttlMs);
  try {
    await prisma.jobLease.create({ data: { name, token, leaseUntil } });
    return token;
  } catch (error) {
    if ((error as { code?: string })?.code !== "P2002") throw error;
  }
  const { count } = await prisma.jobLease.updateMany({
    where: { name, leaseUntil: { lt: now } },
    data: { token, leaseUntil },
  });
  return count === 1 ? token : null;
}

export async function renewLease(prisma: PrismaClient, name: string, token: string, ttlMs: number, now = new Date()) {
  const { count } = await prisma.jobLease.updateMany({
    where: { name, token },
    data: { leaseUntil: new Date(now.getTime() + ttlMs) },
  });
  return count === 1;
}

export async function releaseLease(prisma: PrismaClient, name: string, token: string) {
  await prisma.jobLease.deleteMany({ where: { name, token } });
}

import "server-only";

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * One PrismaClient per process (per serverless instance). DATABASE_URL must be a
 * PostgreSQL URL; on Vercel use the pooled connection string.
 */
export function getPrisma() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

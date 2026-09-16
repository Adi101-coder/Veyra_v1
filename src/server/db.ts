import "server-only";

import path from "node:path";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function resolveDatabaseUrl() {
  const current = process.env.DATABASE_URL;
  if (current && current !== "file:./dev.db" && current !== "file:dev.db") {
    return current;
  }
  return `file:${path.join(process.cwd(), "prisma", "dev.db")}`;
}

export function getPrisma() {
  process.env.DATABASE_URL = resolveDatabaseUrl();
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

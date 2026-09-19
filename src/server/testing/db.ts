import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Per-suite PostgreSQL database for tests: each suite migrates its own schema inside
 * the test database and drops it afterwards, so suites never share rows.
 *
 * Set TEST_DATABASE_URL (default: a local server on port 5544). Start one with:
 *   initdb -D .pgdata -U veyra --auth=trust
 *   pg_ctl -D .pgdata -o "-p 5544 -k /tmp/veyra-pg" start && createdb -h 127.0.0.1 -p 5544 -U veyra veyra_test
 */
export function testDatabaseUrl(schema: string) {
  const base = process.env.TEST_DATABASE_URL ?? "postgresql://veyra@127.0.0.1:5544/veyra_test";
  const url = new URL(base);
  url.searchParams.set("schema", schema);
  return url.toString();
}

export function createTestDatabase(prefix: string) {
  const schema = `${prefix}_${randomBytes(4).toString("hex")}`;
  const url = testDatabaseUrl(schema);
  execFileSync(path.resolve("node_modules/.bin/prisma"), ["migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: "pipe",
  });
  const clientUrl = new URL(url);
  clientUrl.searchParams.set("connection_limit", "2");
  const prisma = new PrismaClient({ datasources: { db: { url: clientUrl.toString() } } });
  return {
    prisma,
    url,
    schema,
    async drop() {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await prisma.$disconnect();
    },
  };
}

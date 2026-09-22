import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function isLoopback(url) {
  if (!url || !String(url).trim()) return true;
  try {
    return LOOPBACK.has(new URL(String(url).trim()).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function applyHostedPostgresEnv() {
  const env = process.env;
  if (isLoopback(env.DATABASE_URL)) {
    const pooled = env.POSTGRES_PRISMA_URL || env.POSTGRES_URL;
    if (pooled && !isLoopback(pooled)) env.DATABASE_URL = pooled;
  }
  if (isLoopback(env.DIRECT_URL)) {
    const direct = env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL;
    if (direct && !isLoopback(direct)) env.DIRECT_URL = direct;
  }
  if (!env.DIRECT_URL?.trim() && env.DATABASE_URL && !isLoopback(env.DATABASE_URL)) {
    env.DIRECT_URL = env.DATABASE_URL;
  }
}

function bin(name) {
  const local = path.join(process.cwd(), "node_modules", ".bin", name);
  return existsSync(local) ? local : name;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

applyHostedPostgresEnv();

const production = process.env.VERCEL_ENV === "production";
const canMigrate =
  production && !isLoopback(process.env.DIRECT_URL) && !isLoopback(process.env.DATABASE_URL);

if (canMigrate) {
  run(bin("prisma"), ["migrate", "deploy"]);
} else if (production) {
  console.warn(
    "[vercel-build] Skipping prisma migrate deploy: DATABASE_URL/DIRECT_URL still points at localhost (127.0.0.1). Vercel cannot reach your laptop. Set Production DATABASE_URL (pooled) and DIRECT_URL (unpooled) to Neon/Vercel Postgres, or add the Vercel Postgres integration (POSTGRES_PRISMA_URL + POSTGRES_URL_NON_POOLING).",
  );
}

run(bin("next"), ["build"]);

/**
 * Vercel Postgres / Neon set POSTGRES_URL (and friends), not DATABASE_URL.
 * A leftover 127.0.0.1 DATABASE_URL from .env.example also cannot be reached
 * from Vercel's build machine or serverless functions.
 */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export function isLoopbackPostgresUrl(url: string | undefined) {
  if (!url?.trim()) return true;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return LOOPBACK.has(host);
  } catch {
    return false;
  }
}

export function applyHostedPostgresEnv(env: Record<string, string | undefined> = process.env) {
  if (isLoopbackPostgresUrl(env.DATABASE_URL)) {
    const pooled = env.POSTGRES_PRISMA_URL || env.POSTGRES_URL;
    if (pooled && !isLoopbackPostgresUrl(pooled)) env.DATABASE_URL = pooled;
  }
  if (isLoopbackPostgresUrl(env.DIRECT_URL)) {
    const direct = env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL;
    if (direct && !isLoopbackPostgresUrl(direct)) env.DIRECT_URL = direct;
  }
  if (!env.DIRECT_URL?.trim() && env.DATABASE_URL && !isLoopbackPostgresUrl(env.DATABASE_URL)) {
    env.DIRECT_URL = env.DATABASE_URL;
  }
  return env;
}

import { describe, expect, it } from "vitest";
import { applyHostedPostgresEnv, isLoopbackPostgresUrl } from "@/server/postgres-env";

describe("applyHostedPostgresEnv", () => {
  it("treats missing and 127.0.0.1 URLs as loopback", () => {
    expect(isLoopbackPostgresUrl(undefined)).toBe(true);
    expect(isLoopbackPostgresUrl("postgresql://veyra@127.0.0.1:5432/veyra")).toBe(true);
    expect(isLoopbackPostgresUrl("postgresql://veyra@db.neon.tech/veyra")).toBe(false);
  });

  it("promotes Vercel Postgres URLs over a leftover localhost DATABASE_URL", () => {
    const env = {
      DATABASE_URL: "postgresql://veyra:veyra@127.0.0.1:5432/veyra",
      DIRECT_URL: "postgresql://veyra:veyra@127.0.0.1:5432/veyra",
      POSTGRES_PRISMA_URL: "postgresql://user:pass@ep-pool.neon.tech/veyra?pgbouncer=true",
      POSTGRES_URL_NON_POOLING: "postgresql://user:pass@ep-direct.neon.tech/veyra",
    };
    applyHostedPostgresEnv(env);
    expect(env.DATABASE_URL).toContain("ep-pool.neon.tech");
    expect(env.DIRECT_URL).toContain("ep-direct.neon.tech");
  });
});

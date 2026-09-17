import { describe, expect, it } from "vitest";
import { isUniqueViolation, isWriteConflict, withUniqueRetry } from "@/server/prisma-retry";

const prismaError = (code: string) => Object.assign(new Error(code), { code });

describe("withUniqueRetry", () => {
  it("retries a unique violation and returns the later success", async () => {
    let calls = 0;
    const result = await withUniqueRetry(async () => {
      calls += 1;
      if (calls < 3) throw prismaError("P2002");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("retries a write conflict", async () => {
    let calls = 0;
    await withUniqueRetry(async () => {
      calls += 1;
      if (calls === 1) throw prismaError("P2034");
      return null;
    });
    expect(calls).toBe(2);
  });

  it("rethrows once attempts are exhausted so callers never see a silent no-op", async () => {
    let calls = 0;
    await expect(
      withUniqueRetry(async () => {
        calls += 1;
        throw prismaError("P2002");
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(calls).toBe(3);
  });

  it("does not retry unrelated errors", async () => {
    let calls = 0;
    await expect(
      withUniqueRetry(async () => {
        calls += 1;
        throw prismaError("P2025");
      }),
    ).rejects.toMatchObject({ code: "P2025" });
    expect(calls).toBe(1);
  });

  it("classifies prisma error codes", () => {
    expect(isUniqueViolation(prismaError("P2002"))).toBe(true);
    expect(isUniqueViolation(prismaError("P2034"))).toBe(false);
    expect(isWriteConflict(prismaError("P2034"))).toBe(true);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
  });
});

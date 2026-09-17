import { describe, expect, it } from "vitest";
import {
  parseChangeConfidenceRequest,
  parseConfidencePct,
  parseIdempotencyKey,
  parsePlaceRequest,
  parseStakeUsd,
  parseWalletAddress,
} from "@/server/betting/validation";
import { BettingError } from "@/server/errors";

describe("betting validation", () => {
  it("acts only for the session wallet and requires an idempotency key", () => {
    const session = "0xABCDEF1234567890abcdef1234567890ABCDEF12";
    const body = { marketId: "hype", outcome: "YES", confidencePct: 60, stakeUsd: "5" };
    expect(parsePlaceRequest(body, "idem-key-123456", session).walletAddress).toBe(session.toLowerCase());
    expect(() => parsePlaceRequest(body, null, session)).toThrow(BettingError);
    expect(() =>
      parsePlaceRequest(
        { ...body, walletAddress: "0x1111111111111111111111111111111111111111" },
        "idem-key-123456",
        session,
      ),
    ).toThrow(BettingError);
  });

  it("accepts EVM and Solana wallets", () => {
    expect(parseWalletAddress("0x1234567890abcdef1234567890abcdef12345678")).toMatch(/^0x/);
    expect(parseWalletAddress("4UQyYVBZxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBeTruthy();
  });

  it("rejects bad wallets, confidence, and short idempotency keys", () => {
    expect(() => parseWalletAddress("not-a-wallet")).toThrow(BettingError);
    expect(() => parseConfidencePct(120)).toThrow(BettingError);
    expect(() => parseIdempotencyKey("short")).toThrow(BettingError);
    expect(() => parseStakeUsd("0")).toThrow(BettingError);
  });

  it("builds a place request from body plus header key", () => {
    const parsed = parsePlaceRequest(
      {
        marketId: "hype",
        outcome: "yes",
        confidencePct: 72,
        stakeUsd: "25.00",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
      },
      "idem-key-123456",
      "0x1234567890abcdef1234567890abcdef12345678",
    );
    expect(parsed.outcome).toBe("YES");
    expect(parsed.idempotencyKey).toBe("idem-key-123456");
    expect(parsed.stakeUsd).toBe("25.00");
  });

  it("parses a change-confidence request and optional quoted price", () => {
    const parsed = parseChangeConfidenceRequest(
      {
        confidencePct: 60,
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        quotedMarketPrice: 0.5,
        expectedConfidencePct: 80,
      },
      "change-key-1234",
      "0x1234567890abcdef1234567890abcdef12345678",
    );
    expect(parsed.confidencePct).toBe(60);
    expect(parsed.quotedMarketPrice).toBe("0.5000");
    expect(parsed.expectedConfidencePct).toBe(80);
    expect(parsed.idempotencyKey).toBe("change-key-1234");
  });
});

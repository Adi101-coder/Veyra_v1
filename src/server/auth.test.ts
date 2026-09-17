import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { decodeBase58, issueSession, readSession, requireOperator, requireWallet, SESSION_COOKIE, verifySolanaSignature } from "@/server/auth";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function encodeBase58(bytes: Buffer) {
  let n = BigInt(`0x${bytes.toString("hex") || "0"}`);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = `1${out}`;
  }
  return out;
}

describe("wallet sessions", () => {
  it("round-trips a session and rejects tampering and expiry", () => {
    const token = issueSession("0xabc0000000000000000000000000000000000001");
    expect(readSession(token)?.walletAddress).toBe("0xabc0000000000000000000000000000000000001");
    const [payload, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ w: "0xevil", e: Date.now() + 1e9 })).toString("base64url");
    expect(readSession(`${forged}.${mac}`)).toBeNull();
    expect(readSession(`${payload}.${mac}x`)).toBeNull();
    expect(readSession(token, Date.now() + 8 * 24 * 3600 * 1000)).toBeNull();
  });

  it("requireWallet reads the cookie and blocks cross-origin writes", () => {
    const token = issueSession("0xabc0000000000000000000000000000000000001");
    const ok = new Request("http://veyra.test/api/predictions", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${token}`, host: "veyra.test", origin: "http://veyra.test" },
    });
    expect(requireWallet(ok)).toBe("0xabc0000000000000000000000000000000000001");
    const csrf = new Request("http://veyra.test/api/predictions", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${token}`, host: "veyra.test", origin: "http://evil.test" },
    });
    expect(() => requireWallet(csrf)).toThrow(/Cross-origin/);
    expect(() => requireWallet(new Request("http://veyra.test/api/predictions", { method: "POST" }))).toThrow(/Sign in/);
  });

  it("operator endpoints are disabled without a token and reject wrong tokens", () => {
    const previous = process.env.VEYRA_OPERATOR_TOKEN;
    delete process.env.VEYRA_OPERATOR_TOKEN;
    expect(() => requireOperator(new Request("http://x/"))).toThrow(/disabled/);
    process.env.VEYRA_OPERATOR_TOKEN = "operator-token-0123456789abcdef";
    expect(() => requireOperator(new Request("http://x/", { headers: { authorization: "Bearer nope" } }))).toThrow(/Operator token/);
    expect(() =>
      requireOperator(new Request("http://x/", { headers: { authorization: "Bearer operator-token-0123456789abcdef" } })),
    ).not.toThrow();
    process.env.VEYRA_OPERATOR_TOKEN = previous;
  });
});

describe("wallet signatures", () => {
  it("verifies a Solana ed25519 signature and rejects another message", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const raw = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
    const address = encodeBase58(raw);
    expect(decodeBase58(address).equals(raw)).toBe(true);
    const message = "Nonce: abc";
    const signature = sign(null, Buffer.from(message), privateKey).toString("hex");
    expect(verifySolanaSignature(address, message, signature)).toBe(true);
    expect(verifySolanaSignature(address, "Nonce: other", signature)).toBe(false);
  });

  it("verifies an EVM personal_sign signature (viem)", async () => {
    const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const signature = await account.signMessage({ message: "Nonce: abc" });
    expect(await verifyMessage({ address: account.address, message: "Nonce: abc", signature })).toBe(true);
    expect(await verifyMessage({ address: account.address, message: "Nonce: xyz", signature })).toBe(false);
  });
});

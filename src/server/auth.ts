import "server-only";

import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature } from "node:crypto";
import { BettingError } from "@/server/errors";
import { getPrisma } from "@/server/db";
import { parseWalletAddress } from "@/server/betting/validation";

/**
 * Wallet sessions. The browser proves control of a wallet by signing a one-time
 * nonce message; the server then issues an HMAC-signed, HttpOnly session cookie.
 * Every write derives the acting wallet from that cookie, never from the body.
 */

export const SESSION_COOKIE = "veyra_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NONCE_TTL_MS = 5 * 60 * 1000;

function sessionSecret() {
  const secret = process.env.VEYRA_SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new BettingError("AUTH_NOT_CONFIGURED", "Server session secret is not configured.", 503);
  }
  // Development only: a per-process secret (sessions reset on restart).
  const holder = globalThis as unknown as { __veyraDevSecret?: string };
  holder.__veyraDevSecret ??= randomBytes(32).toString("hex");
  return holder.__veyraDevSecret;
}

function hmac(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signInMessage(walletAddress: string, nonce: string, host: string, issuedAt: string) {
  return [
    `${host} wants you to sign in to Veyra with your wallet:`,
    walletAddress,
    "",
    "Signing proves you control this wallet. It does not move funds or cost gas.",
    "",
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export async function createNonce(walletRaw: unknown, host: string) {
  const walletAddress = parseWalletAddress(walletRaw);
  const nonce = randomBytes(16).toString("hex");
  const row = await getPrisma().authNonce.create({
    data: { nonce, walletAddress, expiresAt: new Date(Date.now() + NONCE_TTL_MS) },
  });
  return { nonce, message: signInMessage(walletAddress, nonce, host, row.createdAt.toISOString()) };
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function decodeBase58(value: string) {
  const bytes: number[] = [];
  for (const char of value) {
    let carry = BASE58.indexOf(char);
    if (carry < 0) throw new Error("Invalid base58");
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i]! * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of value) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return Buffer.from(bytes.reverse());
}

export function verifySolanaSignature(address: string, message: string, signature: string) {
  const publicKey = decodeBase58(address);
  if (publicKey.length !== 32) return false;
  const sig = /^[0-9a-fA-F]{128}$/.test(signature)
    ? Buffer.from(signature, "hex")
    : /^[A-Za-z0-9+/=]+$/.test(signature) && signature.length === 88
      ? Buffer.from(signature, "base64")
      : decodeBase58(signature);
  if (sig.length !== 64) return false;
  const key = createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: publicKey.toString("base64url") },
    format: "jwk",
  });
  return verifySignature(null, Buffer.from(message, "utf8"), key, sig);
}

async function verifyWalletSignature(address: string, message: string, signature: string) {
  if (address.startsWith("0x")) {
    const { verifyMessage } = await import("viem");
    if (!/^0x[0-9a-fA-F]+$/.test(signature)) return false;
    return verifyMessage({ address: address as `0x${string}`, message, signature: signature as `0x${string}` });
  }
  return verifySolanaSignature(address, message, signature);
}

export async function verifySignIn(body: unknown, host: string) {
  const raw = (body ?? {}) as { walletAddress?: unknown; nonce?: unknown; signature?: unknown };
  const walletAddress = parseWalletAddress(raw.walletAddress);
  if (typeof raw.nonce !== "string" || typeof raw.signature !== "string" || raw.signature.length > 400) {
    throw new BettingError("INVALID_SIGNIN", "nonce and signature are required.");
  }
  const prisma = getPrisma();
  // Single use: only one request can flip usedAt from null.
  const { count } = await prisma.authNonce.updateMany({
    where: { nonce: raw.nonce, walletAddress, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (count !== 1) throw new BettingError("INVALID_NONCE", "Sign-in nonce is invalid or expired.", 401);
  const stored = await prisma.authNonce.findUniqueOrThrow({ where: { nonce: raw.nonce } });
  const message = signInMessage(walletAddress, raw.nonce, host, stored.createdAt.toISOString());
  const ok = await verifyWalletSignature(walletAddress, message, raw.signature).catch(() => false);
  if (!ok) throw new BettingError("INVALID_SIGNATURE", "Wallet signature did not verify.", 401);
  return { walletAddress, token: issueSession(walletAddress) };
}

export function issueSession(walletAddress: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ w: walletAddress, e: now + SESSION_TTL_MS })).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

export function readSession(token: string | undefined | null, now = Date.now()) {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac || !safeEqual(mac, hmac(payload))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { w?: string; e?: number };
    if (!parsed.w || !parsed.e || parsed.e < now) return null;
    return { walletAddress: parsed.w };
  } catch {
    return null;
  }
}

function cookieValue(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** Rejects cross-site browser writes (CSRF) when an Origin header is present. */
function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    if (host && new URL(origin).host === host) return;
  } catch {
    // fall through
  }
  throw new BettingError("CSRF", "Cross-origin request rejected.", 403);
}

export function sessionWallet(request: Request) {
  return readSession(cookieValue(request, SESSION_COOKIE))?.walletAddress ?? null;
}

export function requireWallet(request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") assertSameOrigin(request);
  const wallet = sessionWallet(request);
  if (!wallet) throw new BettingError("UNAUTHENTICATED", "Sign in with your wallet first.", 401);
  return wallet;
}

/** Operator/worker endpoints: `Authorization: Bearer $VEYRA_OPERATOR_TOKEN`. */
export function requireOperator(request: Request) {
  const expected = process.env.VEYRA_OPERATOR_TOKEN;
  if (!expected || expected.length < 24) {
    throw new BettingError("OPERATOR_DISABLED", "Operator endpoints are disabled.", 503);
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !safeEqual(token, expected)) {
    throw new BettingError("FORBIDDEN", "Operator token required.", 403);
  }
}

/**
 * Scheduled worker ticks. Vercel Cron calls the route with
 * `Authorization: Bearer $CRON_SECRET`, so accept that secret as well as the
 * operator token. Both are compared in constant time.
 */
export function requireOperatorOrCron(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const cronSecret = process.env.CRON_SECRET;
  if (token && cronSecret && cronSecret.length >= 16 && safeEqual(token, cronSecret)) return;
  requireOperator(request);
}

export function sessionCookie(token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}`;
}

export function clearedSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

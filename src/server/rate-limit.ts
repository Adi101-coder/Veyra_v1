import "server-only";

import { BettingError } from "@/server/errors";

/**
 * Fixed-window, in-process rate limiter. It protects a single Node instance; a
 * multi-instance deployment needs a shared store (e.g. Redis) instead.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

export function rateLimit(request: Request, scope: string, limit: number, windowMs: number, subject?: string) {
  const key = `${scope}:${subject ?? clientKey(request)}`;
  const now = Date.now();
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 50_000) {
      for (const [entry, value] of windows) if (value.resetAt <= now) windows.delete(entry);
    }
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    throw new BettingError("RATE_LIMITED", "Too many requests. Slow down and try again.", 429);
  }
}

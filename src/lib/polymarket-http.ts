import { lookup } from "node:dns/promises";
import https from "node:https";
import { pinPolymarketDns } from "@/lib/polymarket-dns";

pinPolymarketDns();

const USER_AGENT = "VEYRAMarkets/0.1 (read-only market discovery)";

/** Cloudflare anycast IPs that are reachable when Polymarket's own DNS is poisoned. */
const BRIDGE_IPS = ["104.16.248.249", "104.16.249.249", "104.18.31.187"];
const BRIDGE_DNS = "cloudflare-dns.com";

type CacheEntry<T> = { expires: number; value: T };
const jsonCache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
let bridgeIp: { ip: string; expires: number } | null = null;

async function resolveBridgeIp() {
  if (bridgeIp && bridgeIp.expires > Date.now()) return bridgeIp.ip;
  try {
    const { address } = await lookup(BRIDGE_DNS, { family: 4 });
    if (address) {
      bridgeIp = { ip: address, expires: Date.now() + 10 * 60_000 };
      return address;
    }
  } catch {
    // fall through to the pinned anycast list
  }
  const ip = BRIDGE_IPS[0]!;
  bridgeIp = { ip, expires: Date.now() + 60_000 };
  return ip;
}

function getJsonViaIp(url: string, ip: string, timeoutMs: number): Promise<unknown> {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: ip,
        servername: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: "GET",
        headers: {
          host: target.hostname,
          accept: "application/json",
          "user-agent": USER_AGENT,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk as Buffer));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 500;
          if (status >= 400) {
            reject(new Error(`Polymarket ${status}`));
            return;
          }
          try {
            resolve(body ? JSON.parse(body) : null);
          } catch {
            reject(new Error("Polymarket returned non-JSON"));
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Polymarket timed out")));
    req.end();
  });
}

async function directJson(url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": USER_AGENT,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Polymarket ${response.status}`);
  return response.json();
}

export async function polymarketJson(url: string, ttlMs = 15_000): Promise<unknown> {
  const cached = jsonCache.get(url);
  if (cached && cached.expires > Date.now()) return cached.value;

  const pending = inflight.get(url);
  if (pending) return pending;

  const task = (async () => {
    let value: unknown;
    try {
      value = await directJson(url, 2_500);
    } catch {
      const ip = await resolveBridgeIp();
      try {
        value = await getJsonViaIp(url, ip, 12_000);
      } catch (first) {
        for (const fallback of BRIDGE_IPS) {
          if (fallback === ip) continue;
          try {
            value = await getJsonViaIp(url, fallback, 8_000);
            bridgeIp = { ip: fallback, expires: Date.now() + 10 * 60_000 };
            break;
          } catch {
            // try the next anycast hop
          }
        }
        if (value === undefined) throw first;
      }
    }
    jsonCache.set(url, { expires: Date.now() + ttlMs, value });
    return value;
  })().finally(() => inflight.delete(url));

  inflight.set(url, task);
  return task;
}

/** GET that only cares about HTTP 200 (CLOB `/ok` is plain text). */
export async function polymarketReachable(url: string, timeoutMs = 12_000): Promise<{ ok: true; status: number }> {
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(Math.min(timeoutMs, 4_000)) });
    if (response.ok) return { ok: true, status: response.status };
  } catch {
    // fall through to the Cloudflare IP bridge
  }
  const ip = await resolveBridgeIp();
  const target = new URL(url);
  const status = await new Promise<number>((resolve, reject) => {
    const req = https.request(
      {
        host: ip,
        servername: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: "GET",
        headers: { host: target.hostname, "user-agent": USER_AGENT },
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 500));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Polymarket timed out")));
    req.end();
  });
  if (status >= 400) throw new Error(`Polymarket ${status}`);
  return { ok: true, status };
}

export function peekPolymarketCache<T>(url: string): T | null {
  const cached = jsonCache.get(url);
  if (!cached || cached.expires + 30 * 60_000 < Date.now()) return null;
  return cached.value as T;
}

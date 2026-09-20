import dns from "node:dns";

/**
 * Polymarket's authoritative DNS is often unreachable or poisoned from some
 * networks. Market discovery already falls back to Cloudflare anycast IPs
 * (see polymarket-http.ts). The CLOB SDK uses axios + system DNS, so we pin
 * those hostnames the same way for live orders and readiness.
 */
const PINNED = new Set([
  "clob.polymarket.com",
  "gamma-api.polymarket.com",
  "data-api.polymarket.com",
  "relayer-v2.polymarket.com",
]);

const BRIDGE_IPS = ["104.16.248.249", "104.16.249.249", "104.18.31.187"] as const;

let applied = false;

export function pinPolymarketDns() {
  if (applied) return;
  applied = true;
  try {
    dns.setDefaultResultOrder("ipv4first");
  } catch {
    // older Node
  }
  const original = dns.lookup.bind(dns);
  const patched: typeof dns.lookup = ((hostname, options, callback) => {
    const cb = typeof options === "function" ? options : callback;
    const opts = typeof options === "function" || options == null ? {} : options;
    if (!PINNED.has(String(hostname)) || typeof cb !== "function") {
      return original(hostname, options as never, callback as never);
    }
    const address = BRIDGE_IPS[0]!;
    if (typeof opts === "object" && opts && "all" in opts && opts.all) {
      cb(null, [{ address, family: 4 }]);
      return;
    }
    cb(null, address, 4);
  }) as typeof dns.lookup;
  dns.lookup = patched;
}

export function polymarketPinnedHosts() {
  return [...PINNED];
}

import { ChainConfigError } from "@/lib/robinhood-chain";
import { loadRobinhoodChainConfig } from "@/server/chain/config";

/**
 * Production environment preflight. Pure: reads only the env record it is given and
 * never returns secret values. `instrumentation.ts` runs it at boot and refuses to
 * start a production server with errors, instead of failing on the first request
 * or the first order.
 */

type Env = Record<string, string | undefined>;

export type EnvReport = {
  mode: "live" | "paper";
  errors: string[];
  warnings: string[];
  /** Presence flags only; never values. */
  configured: Record<string, boolean>;
};

const HEX_KEY = /^(0x)?[0-9a-fA-F]{64}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const set = (value: string | undefined) => value != null && value.trim() !== "";

function intInRange(env: Env, key: string, min: number, max: number, errors: string[]) {
  const raw = env[key];
  if (!set(raw)) return;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) errors.push(`${key} must be an integer between ${min} and ${max}.`);
}

export function validateEnvironment(env: Env): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = env.NODE_ENV === "production";
  const modeRaw = (env.POLYMARKET_EXECUTION_MODE ?? "").trim().toLowerCase();
  const mode: EnvReport["mode"] = modeRaw === "live" ? "live" : "paper";

  // Core
  const serverless = set(env.VERCEL) || set(env.AWS_LAMBDA_FUNCTION_NAME) || set(env.NETLIFY);
  if (!set(env.DATABASE_URL)) {
    errors.push("DATABASE_URL is required.");
  } else if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL!.trim())) {
    // The schema and migrations are PostgreSQL-only.
    (production ? errors : warnings).push("DATABASE_URL must be a postgresql:// connection string.");
  }
  if (production && !set(env.DIRECT_URL)) {
    // schema.prisma references env("DIRECT_URL"): the CLI refuses to run without it,
    // so `vercel-build` fails before the app is ever reached.
    errors.push("DIRECT_URL is required: `prisma migrate deploy` cannot run over a transaction pooler, and the Prisma CLI refuses to start without it.");
  }
  if (!set(env.VEYRA_SESSION_SECRET) || env.VEYRA_SESSION_SECRET!.length < 32) {
    (production ? errors : warnings).push("VEYRA_SESSION_SECRET must be at least 32 characters (sessions reset on restart without it).");
  }
  if (!set(env.VEYRA_OPERATOR_TOKEN) || env.VEYRA_OPERATOR_TOKEN!.length < 24) {
    (production ? errors : warnings).push("VEYRA_OPERATOR_TOKEN must be at least 24 characters (operator endpoints are disabled without it).");
  }
  if (production && modeRaw !== "live" && modeRaw !== "paper") {
    errors.push('POLYMARKET_EXECUTION_MODE must be set explicitly to "live" or "paper" in production.');
  }
  if (serverless) {
    // Serverless functions are frozen between requests: an interval-based worker
    // cannot run. Jobs must be driven by a scheduler (Vercel Cron -> /api/jobs/run).
    if (Number(env.VEYRA_WORKER_INTERVAL_MS ?? 0) > 0) {
      errors.push("VEYRA_WORKER_INTERVAL_MS must be 0 on a serverless platform; schedule /api/jobs/run (Vercel Cron) instead.");
    }
    if (!set(env.CRON_SECRET) || env.CRON_SECRET!.length < 16) {
      warnings.push("CRON_SECRET is unset or too short: scheduled worker ticks must authenticate with the operator token instead.");
    }
  } else if (production && !set(env.VEYRA_WORKER_INTERVAL_MS)) {
    warnings.push("VEYRA_WORKER_INTERVAL_MS is unset: no in-process worker. Schedule POST /api/jobs/run instead.");
  }
  intInRange(env, "VEYRA_WORKER_INTERVAL_MS", 0, 3_600_000, errors);

  // Polymarket
  const clobUrl = env.POLYMARKET_CLOB_URL;
  if (set(clobUrl) && !clobUrl!.startsWith("https://")) errors.push("POLYMARKET_CLOB_URL must be https.");
  if (set(env.POLYMARKET_CHAIN_ID) && !["137", "80002"].includes(env.POLYMARKET_CHAIN_ID!)) {
    errors.push("POLYMARKET_CHAIN_ID must be 137 (Polygon) or 80002 (Amoy).");
  }
  if (mode === "live") {
    if (!set(env.POLYMARKET_PRIVATE_KEY) || !HEX_KEY.test(env.POLYMARKET_PRIVATE_KEY!.trim())) {
      errors.push("POLYMARKET_PRIVATE_KEY must be a 32-byte hex key for live execution.");
    }
    const creds = ["POLYMARKET_API_KEY", "POLYMARKET_API_SECRET", "POLYMARKET_API_PASSPHRASE"].filter((key) => set(env[key]));
    if (creds.length > 0 && creds.length < 3) errors.push("Set all three POLYMARKET_API_KEY/SECRET/PASSPHRASE or none (derived at startup).");
    if (creds.length === 0) warnings.push("Polymarket API credentials are unset: they will be derived from the private key on first use; inventory reconciliation stays disabled.");
    const signatureType = Number(env.POLYMARKET_SIGNATURE_TYPE ?? "0");
    if (![0, 1, 2, 3].includes(signatureType)) errors.push("POLYMARKET_SIGNATURE_TYPE must be 0, 1, 2 or 3.");
    if (signatureType !== 0 && !EVM_ADDRESS.test(env.POLYMARKET_FUNDER_ADDRESS ?? "")) {
      errors.push("POLYMARKET_FUNDER_ADDRESS (proxy/safe/deposit wallet) is required for signature types 1-3.");
    }
    if (env.POLYMARKET_CHAIN_ID === "80002") warnings.push("Live mode is pointed at Polygon Amoy (80002), not mainnet.");
    if (!set(env.POLYGON_RPC_URL)) warnings.push("POLYGON_RPC_URL is unset: viem's public Polygon RPC will be used for signing context.");
  } else if (production) {
    warnings.push("Production is running in paper mode: orders are simulated and never reach Polymarket.");
  }

  // Money limits sanity
  intInRange(env, "VEYRA_MAX_SLIPPAGE_BPS", 0, 5_000, errors);
  intInRange(env, "VEYRA_EXECUTION_MAX_SPREAD_BPS", 1, 10_000, errors);
  intInRange(env, "VEYRA_VENUE_TIMEOUT_MS", 1_000, 120_000, errors);

  // Robinhood Chain (validated by the same loader the app uses)
  try {
    const chain = loadRobinhoodChainConfig(env);
    const publicNetwork = (env.NEXT_PUBLIC_RH_NETWORK ?? "testnet").trim().toLowerCase();
    if (publicNetwork !== chain.network) {
      errors.push(`NEXT_PUBLIC_RH_NETWORK (${publicNetwork}) must match RH_NETWORK (${chain.network}) so wallets switch to the settlement chain.`);
    }
    if (chain.rpcSource === "public" && production) warnings.push("Robinhood Chain uses the rate-limited public RPC; set RH_TESTNET_RPC_URL/RH_RPC_URL.");
  } catch (error) {
    errors.push(error instanceof ChainConfigError ? error.message : "Invalid Robinhood Chain configuration.");
  }

  // Inventory reconciliation baseline must be complete or absent
  if (set(env.VEYRA_OMNIBUS_USDC_BASELINE_MICROS) !== set(env.VEYRA_OMNIBUS_USDC_BASELINE_AT)) {
    errors.push("Set both VEYRA_OMNIBUS_USDC_BASELINE_MICROS and VEYRA_OMNIBUS_USDC_BASELINE_AT, or neither.");
  } else if (set(env.VEYRA_OMNIBUS_USDC_BASELINE_AT) && Number.isNaN(new Date(env.VEYRA_OMNIBUS_USDC_BASELINE_AT!).getTime())) {
    errors.push("VEYRA_OMNIBUS_USDC_BASELINE_AT must be an ISO timestamp.");
  }

  return {
    mode,
    errors,
    warnings,
    configured: {
      database: set(env.DATABASE_URL),
      directDatabase: set(env.DIRECT_URL),
      cronSecret: set(env.CRON_SECRET),
      sessionSecret: set(env.VEYRA_SESSION_SECRET),
      operatorToken: set(env.VEYRA_OPERATOR_TOKEN),
      polymarketPrivateKey: set(env.POLYMARKET_PRIVATE_KEY),
      polymarketApiCredentials: ["POLYMARKET_API_KEY", "POLYMARKET_API_SECRET", "POLYMARKET_API_PASSPHRASE"].every((key) => set(env[key])),
      polymarketFunder: set(env.POLYMARKET_FUNDER_ADDRESS),
      polygonRpc: set(env.POLYGON_RPC_URL),
      robinhoodRpc: set(env.RH_TESTNET_RPC_URL) || set(env.RH_RPC_URL),
      robinhoodSettlementKey: set(env.RH_SETTLEMENT_PRIVATE_KEY),
      worker: Number(env.VEYRA_WORKER_INTERVAL_MS ?? 0) > 0,
    },
  };
}

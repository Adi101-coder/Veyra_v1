import { pinPolymarketDns } from "@/lib/polymarket-dns";
import { validateEnvironment } from "@/server/env";
import { applyHostedPostgresEnv } from "@/server/postgres-env";

/**
 * Node-only boot preflight (kept out of instrumentation.ts so the Edge bundle never
 * references process.exit). A misconfigured production server exits instead of
 * failing on the first request or the first live order.
 */
export function runBootPreflight() {
  applyHostedPostgresEnv();
  pinPolymarketDns();
  const report = validateEnvironment(process.env);
  for (const warning of report.warnings) console.warn(`[env] ${warning}`);
  if (report.errors.length) {
    for (const error of report.errors) console.error(`[env] ${error}`);
    // Exiting only makes sense for a long-running server. On serverless hosts (Vercel,
    // Netlify, Lambda) it kills every function invocation, so every route returns the
    // host's HTML error page. There we log and keep serving; readiness reports it.
    const serverless = Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
    if (process.env.NODE_ENV === "production" && !serverless && process.env.VEYRA_STRICT_BOOT !== "false") {
      console.error("[env] Refusing to start: fix the configuration errors above (see .env.production.example).");
      process.exit(1);
    }
  }
  console.info(`[env] execution mode: ${report.mode}`);
}

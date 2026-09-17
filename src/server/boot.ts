import { validateEnvironment } from "@/server/env";

/**
 * Node-only boot preflight (kept out of instrumentation.ts so the Edge bundle never
 * references process.exit). A misconfigured production server exits instead of
 * failing on the first request or the first live order.
 */
export function runBootPreflight() {
  const report = validateEnvironment(process.env);
  for (const warning of report.warnings) console.warn(`[env] ${warning}`);
  if (report.errors.length) {
    for (const error of report.errors) console.error(`[env] ${error}`);
    if (process.env.NODE_ENV === "production") {
      console.error("[env] Refusing to start: fix the configuration errors above (see .env.production.example).");
      process.exit(1);
    }
  }
  console.info(`[env] execution mode: ${report.mode}`);
}

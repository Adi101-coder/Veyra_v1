/**
 * Guards for the LAUNCH.md §6 venue test. That run must never silently become
 * a real-money test.
 */
export function liveTestSafety(env: NodeJS.ProcessEnv = process.env) {
  const custody = (env.VEYRA_CUSTODY_ENABLED ?? "").trim().toLowerCase() === "true";
  const mode = (env.POLYMARKET_EXECUTION_MODE ?? "paper").trim().toLowerCase();
  const maxStake = Number.parseFloat(env.VEYRA_MAX_STAKE_USD ?? "");
  const findings: string[] = [];
  if (custody) {
    findings.push("VEYRA_CUSTODY_ENABLED must stay false for the venue live test.");
  }
  if (mode !== "live") {
    findings.push("POLYMARKET_EXECUTION_MODE=live is required to hit the real CLOB.");
  }
  if (!Number.isFinite(maxStake) || maxStake <= 0 || maxStake > 100) {
    findings.push("VEYRA_MAX_STAKE_USD must be set between 0 exclusive and 100 inclusive.");
  }
  return { ok: findings.length === 0, findings };
}

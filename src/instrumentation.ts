export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const interval = Number.parseInt(process.env.VEYRA_WORKER_INTERVAL_MS ?? "0", 10);
  if (!Number.isFinite(interval) || interval <= 0) return;
  const { startWorkerLoop } = await import("@/server/worker");
  startWorkerLoop(interval);
}

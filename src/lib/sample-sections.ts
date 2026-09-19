/**
 * The markets page carries several sections built from a static sample feed:
 * the featured event, packs, leaderboards, trending positions and the sport and
 * esports rails. None of it comes from the backend.
 *
 * That is fine for design work and misleading in production, where a visitor cannot
 * tell an invented leaderboard from a real one. They are therefore hidden unless
 * explicitly enabled, rather than deleted — the layouts stay available for design.
 *
 * Set NEXT_PUBLIC_VEYRA_SAMPLE_SECTIONS="true" to show them.
 */
export function showSampleSections() {
  return (process.env.NEXT_PUBLIC_VEYRA_SAMPLE_SECTIONS ?? "").trim().toLowerCase() === "true";
}

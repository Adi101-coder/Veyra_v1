/**
 * Vite loads `.env` into the test process. Live-test caps like
 * VEYRA_MAX_STAKE_USD=5 then reject paper suite stakes ($100+).
 * Restore the engine defaults for the suite only.
 */
process.env.VEYRA_MAX_STAKE_USD = "100000.00";
process.env.VEYRA_MIN_STAKE_USD = "1.00";

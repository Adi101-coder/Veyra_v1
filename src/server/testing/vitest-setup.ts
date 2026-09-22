/**
 * Vite loads `.env` into the test process, so a machine configured for a real
 * live run would otherwise drag those settings into the suite.
 *
 * Two kinds of leak matter:
 *  - Live-test caps like VEYRA_MAX_STAKE_USD=25 reject paper suite stakes ($100+).
 *  - VEYRA_CUSTODY_ENABLED=true / POLYMARKET_EXECUTION_MODE=live turn the suite
 *    into a real-money configuration. Tests that genuinely exercise custody set
 *    the flag themselves and restore it, so the safe baseline belongs here.
 *
 * A test must never be a live test by accident, on anyone's machine.
 */
process.env.VEYRA_MAX_STAKE_USD = "100000.00";
process.env.VEYRA_MIN_STAKE_USD = "1.00";
process.env.VEYRA_CUSTODY_ENABLED = "false";
process.env.POLYMARKET_EXECUTION_MODE = "paper";
delete process.env.POLYMARKET_PRIVATE_KEY;

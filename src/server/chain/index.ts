import "server-only";

import { getPrisma } from "@/server/db";
import { createRobinhoodClients, type RobinhoodClients } from "@/server/chain/client";
import { loadRobinhoodChainConfig } from "@/server/chain/config";
import { runSettlementTick } from "@/server/chain/settlement";

let cached: RobinhoodClients | null = null;

/** Process-wide Robinhood Chain clients from env. Throws ChainConfigError on bad config. */
export function getRobinhoodClients() {
  cached ??= createRobinhoodClients(loadRobinhoodChainConfig());
  return cached;
}

export async function runRobinhoodSettlementTick() {
  return runSettlementTick({ prisma: getPrisma(), clients: getRobinhoodClients() });
}

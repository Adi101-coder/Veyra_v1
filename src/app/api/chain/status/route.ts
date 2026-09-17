import { NextResponse } from "next/server";
import { ChainConfigError } from "@/lib/robinhood-chain";
import { getNativeBalance, getRpcStatus } from "@/server/chain/client";
import { publicChainConfig } from "@/server/chain/config";
import { getRobinhoodClients } from "@/server/chain";
import { jsonError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public Robinhood Chain health: configured network, RPC chain-id match, head block, signer funding. */
export async function GET(request: Request) {
  try {
    rateLimit(request, "chain-status", 30, 60_000);
    let clients;
    try {
      clients = getRobinhoodClients();
    } catch (error) {
      if (error instanceof ChainConfigError) {
        return NextResponse.json({ configured: false, error: error.message }, { status: 503 });
      }
      throw error;
    }
    const rpc = await getRpcStatus(clients);
    const signer = clients.account
      ? {
          address: clients.account.address,
          balanceWei: rpc.ok ? (await getNativeBalance(clients, clients.account.address).catch(() => null))?.toString() ?? null : null,
        }
      : null;
    return NextResponse.json(
      {
        configured: true,
        ...publicChainConfig(clients.config),
        rpc: rpc.ok
          ? { ok: true, chainId: rpc.chainId, blockNumber: rpc.blockNumber.toString(), latencyMs: rpc.latencyMs }
          : { ok: false, error: rpc.error, message: rpc.message, latencyMs: rpc.latencyMs },
        signer,
      },
      { status: rpc.ok ? 200 : 503 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

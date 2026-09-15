import { NextResponse } from "next/server";
import {
  isEvmAddress,
  isSolanaAddress,
  type WalletActivity,
  type WalletChain,
  type WalletTransaction,
} from "@/lib/wallet-activity";

const LIMIT = 15;
const SOLANA_RPCS = [
  process.env.SOLANA_RPC_URL,
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
].filter((value): value is string => Boolean(value));

type SolanaSignature = {
  signature: string;
  err: unknown;
  blockTime: number | null;
  memo?: string | null;
};

type ParsedInstruction = {
  program?: string;
  parsed?: {
    type?: string;
    info?: {
      source?: string;
      destination?: string;
      lamports?: number | string;
    };
  };
};

type SolanaTx = {
  blockTime?: number | null;
  meta?: {
    err: unknown;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    innerInstructions?: { instructions: ParsedInstruction[] }[];
  } | null;
  transaction: {
    message: {
      accountKeys: Array<string | { pubkey: string; pubkeyString?: string }>;
      instructions?: ParsedInstruction[];
    };
  };
};

function pubkeyOf(key: string | { pubkey: string; pubkeyString?: string }) {
  return typeof key === "string" ? key : key.pubkeyString ?? key.pubkey;
}

async function solanaRpc<T>(body: unknown): Promise<T> {
  let last = "Solana RPC unavailable";
  for (const url of SOLANA_RPCS) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      });
      const json = (await response.json()) as { result?: T; error?: { message?: string } };
      if (!response.ok || json.error) {
        last = json.error?.message ?? `Solana RPC ${response.status}`;
        continue;
      }
      return json.result as T;
    } catch (error) {
      last = error instanceof Error ? error.message : "Solana RPC failed";
    }
  }
  throw new Error(last);
}

function formatSol(lamports: number) {
  const sol = lamports / 1_000_000_000;
  const abs = Math.abs(sol);
  if (abs === 0) return "—";
  if (abs < 0.0001) return `${sol > 0 ? "+" : "−"}<0.0001 SOL`;
  const digits = abs >= 1 ? 3 : 4;
  return `${sol > 0 ? "+" : "−"}${abs.toFixed(digits)} SOL`;
}

function formatEth(wei: string, inbound: boolean) {
  const value = Number(wei) / 1e18;
  if (!Number.isFinite(value) || value === 0) return "—";
  const abs = Math.abs(value);
  if (abs < 0.0001) return `${inbound ? "+" : "−"}<0.0001 ETH`;
  const digits = abs >= 1 ? 4 : 5;
  return `${inbound ? "+" : "−"}${abs.toFixed(digits)} ETH`;
}

function solanaCounterparty(tx: SolanaTx, address: string) {
  const outer = tx.transaction.message.instructions ?? [];
  const inner = tx.meta?.innerInstructions?.flatMap((item) => item.instructions) ?? [];
  for (const instruction of [...outer, ...inner]) {
    const info = instruction.parsed?.info;
    if (!info) continue;
    if (instruction.parsed?.type !== "transfer") continue;
    if (info.source === address && info.destination) return info.destination;
    if (info.destination === address && info.source) return info.source;
  }
  return null;
}

function solanaMethod(tx: SolanaTx) {
  const outer = tx.transaction.message.instructions ?? [];
  const inner = tx.meta?.innerInstructions?.flatMap((item) => item.instructions) ?? [];
  const parsed = [...outer, ...inner]
    .map((instruction) => instruction.parsed?.type)
    .filter((type): type is string => Boolean(type));
  const preferred =
    parsed.find((type) => type === "transfer" || type === "transferChecked") ??
    parsed.find((type) => type !== "advanceNonce");
  if (preferred) return preferred.replaceAll("_", " ");
  if (outer[0]?.program) return outer[0].program;
  return "Transaction";
}

async function fetchSolana(address: string): Promise<WalletActivity> {
  const balance = await solanaRpc<{ value: number }>({
    jsonrpc: "2.0",
    id: 1,
    method: "getBalance",
    params: [address],
  });
  const lamports = balance.value;

  const signatures = await solanaRpc<SolanaSignature[]>({
    jsonrpc: "2.0",
    id: 1,
    method: "getSignaturesForAddress",
    params: [address, { limit: LIMIT }],
  });

  let parsed: Array<SolanaTx | null> = signatures.map(() => null);
  try {
    const batch = signatures.map((item, index) => ({
      jsonrpc: "2.0",
      id: index + 1,
      method: "getTransaction",
      params: [
        item.signature,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
      ],
    }));
    let last = "batch failed";
    for (const url of SOLANA_RPCS) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(14_000),
        });
        const json = (await response.json()) as Array<{
          id: number;
          result?: SolanaTx | null;
        }>;
        if (!response.ok || !Array.isArray(json)) {
          last = `Solana RPC ${response.status}`;
          continue;
        }
        parsed = signatures.map((_, index) => {
          const row = json.find((item) => item.id === index + 1);
          return row?.result ?? null;
        });
        break;
      } catch (error) {
        last = error instanceof Error ? error.message : last;
      }
    }
    void last;
  } catch {
    parsed = signatures.map(() => null);
  }

  const transactions: WalletTransaction[] = signatures.map((item, index) => {
    const tx = parsed[index];
    const keys = tx?.transaction.message.accountKeys.map(pubkeyOf) ?? [];
    const accountIndex = keys.indexOf(address);
    const pre = tx?.meta?.preBalances[accountIndex] ?? 0;
    const post = tx?.meta?.postBalances[accountIndex] ?? 0;
    const fee = tx?.meta?.fee ?? 0;
    const feePayer = keys[0] === address;
    const delta = accountIndex >= 0 ? post - pre + (feePayer ? fee : 0) : 0;
    const direction: WalletTransaction["direction"] =
      delta > 0 ? "in" : delta < 0 ? "out" : "self";

    return {
      hash: item.signature,
      timestamp: item.blockTime,
      status: item.err ? "failed" : "success",
      direction,
      counterparty: tx ? solanaCounterparty(tx, address) : null,
      amountLabel: tx && accountIndex >= 0 ? formatSol(delta) : "—",
      method: tx ? solanaMethod(tx) : item.memo ? "Memo" : "Transaction",
      explorerUrl: `https://solscan.io/tx/${item.signature}`,
    };
  });

  const sol = lamports / 1_000_000_000;
  return {
    address,
    chain: "solana",
    balanceLabel: `${sol.toFixed(sol >= 1 ? 3 : 4)} SOL`,
    transactions,
  };
}

type ExplorerTx = {
  hash: string;
  timeStamp: string;
  isError: string;
  value: string;
  from: string;
  to: string;
  functionName?: string;
  methodId?: string;
};

async function fetchEvm(address: string): Promise<WalletActivity> {
  const query = new URLSearchParams({
    module: "account",
    action: "txlist",
    address,
    page: "1",
    offset: String(LIMIT),
    sort: "desc",
  });
  const balanceQuery = new URLSearchParams({
    module: "account",
    action: "balance",
    address,
  });

  const [balanceRes, txRes] = await Promise.all([
    fetch(`https://eth.blockscout.com/api?${balanceQuery}`, {
      signal: AbortSignal.timeout(15_000),
    }),
    fetch(`https://eth.blockscout.com/api?${query}`, {
      signal: AbortSignal.timeout(15_000),
    }),
  ]);

  if (!txRes.ok) {
    throw new Error("Could not read Ethereum transactions");
  }

  const txJson = (await txRes.json()) as {
    status?: string;
    message?: string;
    result?: ExplorerTx[] | string;
  };
  if (!Array.isArray(txJson.result)) {
    throw new Error(
      typeof txJson.result === "string" ? txJson.result : "Could not read Ethereum transactions",
    );
  }

  const balanceJson = balanceRes.ok
    ? ((await balanceRes.json()) as { result?: string })
    : { result: "0" };

  const lower = address.toLowerCase();
  const transactions: WalletTransaction[] = txJson.result.slice(0, LIMIT).map((item) => {
    const from = item.from ?? "";
    const to = item.to || null;
    const inbound = to?.toLowerCase() === lower;
    const outbound = from.toLowerCase() === lower;
    const fn = item.functionName?.split("(")[0]?.trim();
    return {
      hash: item.hash,
      timestamp: item.timeStamp ? Number(item.timeStamp) : null,
      status: item.isError === "1" ? "failed" : "success",
      direction: inbound && outbound ? "self" : inbound ? "in" : "out",
      counterparty: inbound ? from || null : to,
      amountLabel: formatEth(item.value ?? "0", inbound && !outbound),
      method: fn || (inbound && !outbound ? "Receive" : outbound ? "Send" : "Transaction"),
      explorerUrl: `https://etherscan.io/tx/${item.hash}`,
    };
  });

  const eth = Number(balanceJson.result ?? "0") / 1e18;
  return {
    address,
    chain: "evm",
    balanceLabel: `${Number.isFinite(eth) ? eth.toFixed(eth >= 1 ? 4 : 5) : "0"} ETH`,
    transactions,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.trim() ?? "";
  const chain = url.searchParams.get("chain") as WalletChain | null;

  if (chain !== "solana" && chain !== "evm") {
    return NextResponse.json({ error: "chain must be solana or evm" }, { status: 400 });
  }
  if (chain === "solana" && !isSolanaAddress(address)) {
    return NextResponse.json({ error: "Invalid Solana address" }, { status: 400 });
  }
  if (chain === "evm" && !isEvmAddress(address)) {
    return NextResponse.json({ error: "Invalid Ethereum address" }, { status: 400 });
  }

  try {
    const activity = chain === "solana" ? await fetchSolana(address) : await fetchEvm(address);
    return NextResponse.json(activity, {
      headers: { "Cache-Control": "private, max-age=20" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load transactions";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

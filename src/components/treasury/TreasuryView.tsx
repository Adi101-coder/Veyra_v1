"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { useWallet } from "@/components/wallet/WalletProvider";
import { describeBettingError } from "@/lib/betting";
import {
  getDepositInfo,
  getTreasuryBalances,
  getTreasuryExposure,
  listWithdrawals,
  requestWithdrawal,
  type DepositInfo,
  type TreasuryBalance,
  type TreasuryExposure,
  type TreasuryWithdrawal,
} from "@/lib/betting-api";
import { shortenAddress } from "@/lib/solana-wallet";

const labelClass = "font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b]";

/** Base units are integers in the asset's own scale; format for display only. */
function formatBase(balanceBase: string, decimals: number) {
  const negative = balanceBase.startsWith("-");
  const digits = (negative ? balanceBase.slice(1) : balanceBase).padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals > 0 ? digits.slice(digits.length - decimals) : "";
  const trimmed = fraction.replace(/0+$/, "").slice(0, 4);
  const formatted = `${Number(whole).toLocaleString("en-US")}${trimmed ? `.${trimmed}` : ""}`;
  return negative ? `-${formatted}` : formatted;
}

const usdFromMicros = (micros: string) =>
  (Number(BigInt(micros)) / 1_000_000).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

/** USDC micros from a decimal string. Rejects more than 6 fractional digits. */
function cashMicros(input: string): bigint | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  const micros = BigInt(`${whole}${fraction.padEnd(6, "0")}`);
  return micros > 0n ? micros : null;
}

function withdrawalStatusLabel(row: TreasuryWithdrawal) {
  switch (row.status) {
    case "PENDING":
      return row.manualOnly ? "Waiting for review" : "Queued to send";
    case "SENDING":
      return "Sending";
    case "COMPLETED":
      return "Sent";
    case "FAILED":
      return "Returned to your balance";
    default:
      return row.status;
  }
}

/**
 * Deposits and venue exposure, deliberately shown as two separate ledgers.
 *
 * Deposits are assets the user owns, held in a watch-only treasury wallet. Exposure
 * is their share of the omnibus Polymarket wallet, derived from filled positions.
 * The two are never netted, so the page never shows a single combined "balance".
 */
function BalancesIntro({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[#f1f6ff]">
      <Shell className="max-w-3xl pt-10 pb-20">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#ad4c62]">Custody</p>
        <h1 className="mt-3 font-serif text-[32px] leading-tight tracking-[-0.03em] text-[#182d4a] sm:text-[42px]">
          Balances.
        </h1>
        {children}
      </Shell>
    </div>
  );
}

export function TreasuryView() {
  const { address, hasSession, sessionChecked, signingIn, signIn, signInError, depositToTreasury } = useWallet();
  const [balances, setBalances] = useState<TreasuryBalance[] | null>(null);
  const [exposure, setExposure] = useState<TreasuryExposure | null>(null);
  const [withdrawals, setWithdrawals] = useState<TreasuryWithdrawal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dest, setDest] = useState("");
  const [amount, setAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawNote, setWithdrawNote] = useState<string | null>(null);
  const [depositInfo, setDepositInfo] = useState<DepositInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [depositNote, setDepositNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDepositInfo()
      .then((info) => {
        if (!cancelled) setDepositInfo(info);
      })
      .catch(() => {
        // The rest of the page is still correct without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reloadGeneration = useRef(0);
  const reload = useCallback(async () => {
    const generation = ++reloadGeneration.current;
    // Settled separately: a failed withdrawal list must not hide a balance that loaded.
    const [balanceResult, exposureResult, withdrawalResult] = await Promise.allSettled([
      getTreasuryBalances(),
      getTreasuryExposure(),
      listWithdrawals(),
    ]);
    if (generation !== reloadGeneration.current) return;

    const problems: string[] = [];
    if (balanceResult.status === "fulfilled") {
      setBalances(balanceResult.value.balances);
    } else {
      problems.push(describeBettingError(balanceResult.reason, "Could not load your balances."));
    }
    if (exposureResult.status === "fulfilled") {
      setExposure(exposureResult.value);
    } else {
      problems.push(describeBettingError(exposureResult.reason, "Could not load Polymarket exposure."));
    }
    if (withdrawalResult.status === "fulfilled") {
      setWithdrawals(withdrawalResult.value.withdrawals);
    } else {
      setWithdrawals((current) => current ?? []);
      problems.push(describeBettingError(withdrawalResult.reason, "Could not load withdrawals."));
    }
    setError(problems.length > 0 ? problems.join(" ") : null);
  }, []);

  useEffect(() => {
    if (!address || !hasSession) return;
    let cancelled = false;
    const load = () => {
      if (!cancelled) void reload();
    };
    load();
    // Withdrawals move from queued to sent without another click, and a failed
    // send returns the debit. Poll so the list stays the source of truth.
    const timer = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [address, hasSession, reload]);

  const cashDepositAsset =
    depositInfo?.assets.find((asset) => asset.isCashAsset) ?? null;

  if (!address) {
    return (
      <BalancesIntro>
        <p className="mt-4 max-w-[32rem] text-[15px] leading-6 text-[#65758b] italic">
          Connect a wallet, then sign in, to see deposits and Polymarket exposure.
        </p>
        <div className="mt-6">
          <ConnectWalletButton />
        </div>
      </BalancesIntro>
    );
  }

  if (!sessionChecked) {
    return (
      <BalancesIntro>
        <p className="mt-4 max-w-[32rem] text-[15px] leading-6 text-[#65758b] italic">
          Checking whether this wallet is signed in…
        </p>
      </BalancesIntro>
    );
  }

  if (!hasSession) {
    return (
      <BalancesIntro>
        <p className="mt-4 max-w-[32rem] text-[15px] leading-6 text-[#65758b] italic">
          Sign in with {shortenAddress(address, 6)} to see balances. One signature, no gas.
        </p>
        <button
          type="button"
          disabled={signingIn}
          onClick={() => {
            void signIn().catch(() => undefined);
          }}
          className="mt-6 rounded-full bg-[#265bff] px-5 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-white disabled:opacity-60"
        >
          {signingIn ? "Confirm in wallet…" : "Sign in"}
        </button>
        {signInError ? (
          <p className="mt-3 font-mono text-[12px] text-[#ad4c62]">{signInError}</p>
        ) : null}
      </BalancesIntro>
    );
  }

  return (
    <div className="bg-[#f1f6ff]">
      <Shell className="max-w-3xl pt-8 pb-20">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#ad4c62]">Custody</p>
        <h1 className="mt-3 font-serif text-[32px] leading-tight tracking-[-0.03em] text-[#182d4a] sm:text-[42px]">
          Balances.
        </h1>
        <p className="mt-3 max-w-[34rem] text-[15px] leading-6 text-[#65758b] italic">
          Deposits sit in a watch-only wallet Split cannot spend from. Venue exposure is
          tracked separately, and the two are never mixed.
        </p>
        <p className="mt-2 font-mono text-[11px] text-[#657da0]">{shortenAddress(address, 6)}</p>

        {error ? (
          <p className="mt-8 rounded-[18px] border border-[#e0cccc] bg-[#ffeff0] px-5 py-4 font-mono text-[12px] text-[#ad4c62]">
            {error}
          </p>
        ) : null}

        <section className="mt-8">
          <p className={labelClass}>Deposit</p>
          {depositInfo?.acceptsDeposits && depositInfo.treasuryAddress ? (
            <>
              <p className="mt-2 max-w-[34rem] text-[13px] leading-5 text-[#65758b]">
                Send any accepted asset below to this address. It is credited to the
                wallet it was sent from, once the transfer confirms on-chain.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[18px] border border-[rgba(24,45,74,0.12)] bg-white px-4 py-3">
                <code className="break-all font-mono text-[12px] text-[#182d4a]">
                  {depositInfo.treasuryAddress}
                </code>
                <button
                  type="button"
                  className="ml-auto rounded-full border border-[rgba(24,45,74,0.12)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#65758b] hover:text-[#182d4a]"
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(depositInfo.treasuryAddress ?? "")
                      .then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      })
                      .catch(() => undefined);
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <ul className="mt-3 space-y-1.5">
                {depositInfo.assets.map((asset) => (
                  <li
                    key={`${asset.chainId}:${asset.contract}`}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[11px] text-[#65758b]"
                  >
                    <span className="text-[12px] uppercase tracking-[0.12em] text-[#182d4a]">
                      {asset.symbol}
                    </span>
                    <span>chain {asset.chainId}</span>
                    <span className="break-all">{asset.contract}</span>
                    {asset.isCashAsset ? (
                      <span className="text-[#265bff]">spendable</span>
                    ) : (
                      <span>held only</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3 max-w-[34rem] text-[12px] leading-5 text-[#65758b]">
                Only these exact contracts are credited. Anything else — including the
                chain&apos;s native coin — will arrive but will not appear as a balance.
                Only {depositInfo.cashAsset} can be used to place a prediction.
              </p>

              {cashDepositAsset ? (
                <form
                  className="mt-4 flex flex-col gap-2 sm:flex-row"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const value = Number.parseFloat(depositAmount);
                    if (!Number.isFinite(value) || value <= 0) {
                      setDepositNote(`Enter a positive ${cashDepositAsset.symbol} amount.`);
                      return;
                    }
                    setDepositing(true);
                    setDepositNote(null);
                    try {
                      // Scale by the asset's own decimals via string maths: a float
                      // multiply loses precision at the units the ledger records.
                      const [whole, fraction = ""] = depositAmount.trim().split(".");
                      const padded = (fraction + "0".repeat(cashDepositAsset.decimals)).slice(
                        0,
                        cashDepositAsset.decimals,
                      );
                      const amountBase = BigInt(`${whole || "0"}${padded}`);
                      const hash = await depositToTreasury({
                        chainId: cashDepositAsset.chainId,
                        contract: cashDepositAsset.contract,
                        treasury: depositInfo.treasuryAddress!,
                        amountBase,
                      });
                      setDepositAmount("");
                      setDepositNote(
                        `Sent ${hash.slice(0, 10)}… It is credited once the transfer confirms on-chain.`,
                      );
                    } catch (err: unknown) {
                      setDepositNote(
                        err instanceof Error ? err.message : "Could not send the deposit.",
                      );
                    } finally {
                      setDepositing(false);
                    }
                  }}
                >
                  <input
                    value={depositAmount}
                    onChange={(event) => setDepositAmount(event.target.value)}
                    inputMode="decimal"
                    placeholder={`Amount in ${cashDepositAsset.symbol}`}
                    className="w-full rounded-full border border-[rgba(24,45,74,0.16)] bg-white px-4 py-2 font-mono text-[12px] text-[#182d4a] outline-none sm:w-52"
                  />
                  <button
                    type="submit"
                    disabled={depositing}
                    className="rounded-full bg-[#265bff] px-5 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-white disabled:opacity-60"
                  >
                    {depositing ? "Confirm in wallet…" : "Deposit"}
                  </button>
                </form>
              ) : null}
              {depositNote ? (
                <p className="mt-2 font-mono text-[11px] text-[#65758b]">{depositNote}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-2 max-w-[34rem] text-[13px] leading-5 text-[#65758b]">
              Deposits are not configured on this deployment.
            </p>
          )}
        </section>

        <section className="mt-10">
          <p className={labelClass}>Deposits</p>
          {balances === null && !error ? (
            <p className="mt-3 rounded-[18px] border border-dashed border-[rgba(24,45,74,0.16)] px-5 py-6 text-[14px] text-[#65758b]">
              Loading deposits…
            </p>
          ) : balances && balances.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {balances.map((balance) => (
                <li
                  key={balance.asset}
                  className="flex items-center justify-between rounded-[18px] border border-[rgba(24,45,74,0.08)] bg-white px-5 py-4"
                >
                  <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-[#182d4a]">
                    {balance.asset}
                  </span>
                  <span className="font-serif text-[20px] tracking-[-0.02em] text-[#182d4a] tabular-nums">
                    {formatBase(balance.balanceBase, balance.decimals)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-[18px] border border-dashed border-[rgba(24,45,74,0.16)] px-5 py-6 text-[14px] text-[#65758b]">
              {balances === null
                ? "Balance could not be loaded."
                : "No deposits yet. Deposits are credited once the transfer confirms on-chain."}
            </p>
          )}
        </section>

        <section className="mt-10">
          <p className={labelClass}>Withdraw {depositInfo?.cashAsset ?? "funds"}</p>
          <p className="mt-2 max-w-[34rem] text-[13px] leading-5 text-[#65758b]">
            Funds are held immediately. An operator sends {depositInfo?.cashAsset ?? "funds"} from
            a wallet this server does not control.
          </p>
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={async (event) => {
              event.preventDefault();
              const amountMicros = cashMicros(amount);
              if (amountMicros === null) {
                setWithdrawNote(`Enter a positive ${depositInfo?.cashAsset ?? "cash"} amount with at most 6 decimal places.`);
                return;
              }
              setWithdrawing(true);
              setWithdrawNote(null);
              try {
                const created = await requestWithdrawal({
                  destAddress: dest,
                  amountMicros: amountMicros.toString(),
                });
                setWithdrawals((current) => [
                  {
                    id: created.id,
                    status: created.status,
                    amountMicros: created.amountMicros,
                    destAddress: created.destAddress,
                    txHash: null,
                    errorMessage: null,
                    manualOnly: false,
                    createdAt: new Date().toISOString(),
                  },
                  ...(current ?? []).filter((row) => row.id !== created.id),
                ]);
                setWithdrawNote(
                  "Withdrawal requested. It is listed below and already deducted from your balance. Small withdrawals are sent automatically within about a minute; larger ones are reviewed and sent by an operator.",
                );
                setAmount("");
                try {
                  await reload();
                } catch (err: unknown) {
                  setError(describeBettingError(err, "Could not refresh your balances."));
                }
              } catch (err: unknown) {
                setWithdrawNote(describeBettingError(err, "Could not request a withdrawal."));
              } finally {
                setWithdrawing(false);
              }
            }}
          >
            <input
              value={dest}
              onChange={(event) => setDest(event.target.value)}
              placeholder="Destination 0x…"
              className="h-11 flex-1 rounded-[14px] border border-[rgba(24,45,74,0.08)] bg-white px-4 text-[13px] outline-none"
            />
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Amount"
              className="h-11 w-full rounded-[14px] border border-[rgba(24,45,74,0.08)] bg-white px-4 text-[13px] outline-none sm:w-28"
            />
            <button
              type="submit"
              disabled={withdrawing}
              className="h-11 rounded-[14px] bg-[#265bff] px-4 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {withdrawing ? "Sending…" : "Request"}
            </button>
          </form>
          {withdrawNote ? <p className="mt-2 font-mono text-[12px] text-[#65758b]">{withdrawNote}</p> : null}
          {withdrawals === null ? (
            <p className="mt-3 text-[13px] leading-5 text-[#65758b]">Loading withdrawals…</p>
          ) : withdrawals.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {withdrawals.map((row) => (
                <li
                  key={row.id}
                  className="rounded-[18px] border border-[rgba(24,45,74,0.08)] bg-white px-5 py-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-serif text-[18px] tracking-[-0.02em] text-[#182d4a] tabular-nums">
                      {usdFromMicros(row.amountMicros)}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#265bff]">
                      {withdrawalStatusLabel(row)}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-[#65758b]">
                    To {shortenAddress(row.destAddress, 6)}
                    {" · "}
                    {new Date(row.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {row.txHash ? ` · ${shortenAddress(row.txHash, 6)}` : ""}
                  </p>
                  {row.status === "FAILED" && row.errorMessage ? (
                    <p className="mt-1 font-mono text-[11px] text-[#ad4c62]">{row.errorMessage}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] leading-5 text-[#65758b]">
              Withdrawals you request show up here right away, including while they are still being sent.
            </p>
          )}
        </section>

        <section className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <p className={labelClass}>Polymarket exposure</p>
            {exposure ? (
              <p className="font-serif text-[20px] tracking-[-0.02em] text-[#182d4a] tabular-nums">
                {usdFromMicros(exposure.totalNotionalMicros)}
              </p>
            ) : null}
          </div>
          {exposure && exposure.positions.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {exposure.positions.map((position) => (
                <li
                  key={position.predictionId}
                  className="flex items-center justify-between gap-4 rounded-[18px] border border-[rgba(24,45,74,0.08)] bg-white px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-serif text-[16px] text-[#182d4a]">{position.marketId}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#657da0]">
                      {position.outcome} · {position.status}
                    </p>
                  </div>
                  <span className="shrink-0 font-serif text-[18px] tracking-[-0.02em] text-[#182d4a] tabular-nums">
                    {usdFromMicros(position.notionalMicros)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-[18px] border border-dashed border-[rgba(24,45,74,0.16)] px-5 py-6 text-[14px] text-[#65758b]">
              Nothing held. Only filled positions count — an order that never filled is
              not exposure.
            </p>
          )}
        </section>
      </Shell>
    </div>
  );
}

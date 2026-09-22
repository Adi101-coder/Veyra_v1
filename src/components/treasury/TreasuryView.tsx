"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { useWallet } from "@/components/wallet/WalletProvider";
import { describeBettingError } from "@/lib/betting";
import {
  getTreasuryBalances,
  getTreasuryExposure,
  requestWithdrawal,
  type TreasuryBalance,
  type TreasuryExposure,
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

/**
 * Deposits and venue exposure, deliberately shown as two separate ledgers.
 *
 * Deposits are assets the user owns, held in a watch-only treasury wallet. Exposure
 * is their share of the omnibus Polymarket wallet, derived from filled positions.
 * The two are never netted, so the page never shows a single combined "balance".
 */
export function TreasuryView() {
  const { address, hasSession } = useWallet();
  const [balances, setBalances] = useState<TreasuryBalance[] | null>(null);
  const [exposure, setExposure] = useState<TreasuryExposure | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dest, setDest] = useState("");
  const [amount, setAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawNote, setWithdrawNote] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !hasSession) return;
    let cancelled = false;
    Promise.all([getTreasuryBalances(), getTreasuryExposure()])
      .then(([balanceResult, exposureResult]) => {
        if (cancelled) return;
        setBalances(balanceResult.balances);
        setExposure(exposureResult);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(describeBettingError(err, "Could not load your balances."));
      });
    return () => {
      cancelled = true;
    };
  }, [address, hasSession]);

  if (!address || !hasSession) {
    return (
      <div className="bg-[#f1f6ff]">
        <Shell className="max-w-3xl pt-10 pb-20">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#ad4c62]">Custody</p>
          <h1 className="mt-3 font-serif text-[32px] leading-tight tracking-[-0.03em] text-[#182d4a] sm:text-[42px]">
            Balances.
          </h1>
          <p className="mt-4 max-w-[32rem] text-[15px] leading-6 text-[#65758b] italic">
            Connect a wallet to see what it has deposited and what it holds on Polymarket.
          </p>
        </Shell>
      </div>
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
          Deposits sit in a watch-only wallet Veyra cannot spend from. Venue exposure is
          tracked separately, and the two are never mixed.
        </p>
        <p className="mt-2 font-mono text-[11px] text-[#657da0]">{shortenAddress(address, 6)}</p>

        {error ? (
          <p className="mt-8 rounded-[18px] border border-[#e0cccc] bg-[#ffeff0] px-5 py-4 font-mono text-[12px] text-[#ad4c62]">
            {error}
          </p>
        ) : null}

        <section className="mt-8">
          <p className={labelClass}>Deposits</p>
          {balances && balances.length > 0 ? (
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
              No deposits yet. Deposits are credited once the transfer confirms on-chain.
            </p>
          )}
        </section>

        <section className="mt-10">
          <p className={labelClass}>Withdraw USDC</p>
          <p className="mt-2 max-w-[34rem] text-[13px] leading-5 text-[#65758b]">
            Funds are held immediately. An operator sends USDC from a wallet this
            server does not control.
          </p>
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={async (event) => {
              event.preventDefault();
              const dollars = Number.parseFloat(amount);
              if (!Number.isFinite(dollars) || dollars <= 0) {
                setWithdrawNote("Enter a positive USDC amount.");
                return;
              }
              setWithdrawing(true);
              setWithdrawNote(null);
              try {
                const result = await requestWithdrawal({
                  destAddress: dest,
                  amountMicros: BigInt(Math.round(dollars * 1_000_000)).toString(),
                });
                setWithdrawNote(`Queued ${result.id}. Status: ${result.status}.`);
                setAmount("");
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

"use client";

import { useWallet } from "@/components/wallet/WalletProvider";

/**
 * Explains the one-time wallet sign-in signature that the first write triggers.
 * Renders nothing when no wallet is connected.
 */
export function WalletSignatureNote({
  className = "",
  hint = "First wager asks your wallet for a one-time signature (no gas).",
}: {
  className?: string;
  /** Shown before the first write when the wallet has no verified session yet. */
  hint?: string;
}) {
  const { address, signingIn, hasSession } = useWallet();
  if (!address) return null;

  let content: React.ReactNode = null;
  if (signingIn) {
    content = (
      <p className="text-[12px] leading-5 text-[#1847d8]">
        Confirm the signature in your wallet — verifies ownership, no gas or funds.
      </p>
    );
  } else if (!hasSession) {
    content = <p className="text-[11px] leading-5 text-[#65758b]">{hint}</p>;
  }

  return (
    <div aria-live="polite" className={className}>
      {content}
    </div>
  );
}

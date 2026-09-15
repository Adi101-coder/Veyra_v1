import type { WalletId } from "@/lib/solana-wallet";

const ICONS: Record<WalletId, { src: string; shape: string }> = {
  binance: { src: "/wallets/binance.svg", shape: "rounded-full" },
  metamask: { src: "/wallets/metamask.svg", shape: "" },
  solflare: { src: "/wallets/solflare.svg", shape: "rounded-[8px]" },
  phantom: { src: "/wallets/phantom.svg", shape: "rounded-full" },
  backpack: { src: "/wallets/backpack.svg", shape: "rounded-full" },
  coinbase: { src: "/wallets/coinbase.svg", shape: "rounded-full" },
};

export function WalletIcon({
  id,
  className = "h-8 w-8",
}: {
  id: WalletId;
  className?: string;
}) {
  const icon = ICONS[id];
  return (
    <img
      src={icon.src}
      alt=""
      aria-hidden
      className={`${className} ${icon.shape} shrink-0 object-cover`.trim()}
    />
  );
}

"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  binanceWallet,
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  phantomWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { mainnet, polygon, type Chain } from "wagmi/chains";
import { publicRobinhoodChain } from "@/lib/robinhood-chain";
import { siteConfig } from "@/lib/site";

const robinhood = publicRobinhoodChain();

/** Polygon is where Polymarket collateral lives; Robinhood is the app chain; mainnet keeps a normal wallet from looking unsupported. */
function appChains(): [Chain, ...Chain[]] {
  const list: Chain[] = [polygon];
  if (!list.some((chain) => chain.id === robinhood.id)) list.push(robinhood);
  if (!list.some((chain) => chain.id === mainnet.id)) list.push(mainnet);
  return list as [Chain, ...Chain[]];
}

/**
 * WalletConnect cloud id. Injected wallets (MetaMask, Rainbow, Coinbase, Phantom)
 * still connect when this is unset; the QR code does not.
 */
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || "00000000000000000000000000000000";

export const wagmiConfig = getDefaultConfig({
  appName: siteConfig.name,
  projectId,
  chains: appChains(),
  ssr: true,
  wallets: [
    {
      groupName: "Popular",
      wallets: [
        metaMaskWallet,
        rainbowWallet,
        coinbaseWallet,
        phantomWallet,
        binanceWallet,
        walletConnectWallet,
        injectedWallet,
      ],
    },
  ],
});

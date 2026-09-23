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
 * WalletConnect / Reown project id. A missing or placeholder id must not be sent:
 * Reown answers with "origin not on the allowlist" and Next paints that as a crash.
 * Injected wallets still connect. The QR code appears only with a real id whose
 * allowlist includes this site (http://localhost:3000 in development).
 */
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ?? "";
const walletConnectReady = /^[a-f0-9]{32}$/i.test(projectId) && !/^0+$/.test(projectId);

const wallets = [
  metaMaskWallet,
  rainbowWallet,
  coinbaseWallet,
  phantomWallet,
  binanceWallet,
  ...(walletConnectReady ? [walletConnectWallet] : []),
  injectedWallet,
];

export const wagmiConfig = getDefaultConfig({
  appName: siteConfig.name,
  projectId: walletConnectReady ? projectId : "00000000000000000000000000000000",
  chains: appChains(),
  ssr: true,
  wallets: [
    {
      groupName: "Popular",
      wallets,
    },
  ],
});

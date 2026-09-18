"use client";

import {getDefaultConfig} from "@rainbow-me/rainbowkit";
import {coinbaseWallet, rainbowWallet, walletConnectWallet} from "@rainbow-me/rainbowkit/wallets";
import {cookieStorage, createStorage, http} from "wagmi";
import {activeChain, publicRpcUrl} from "./chain";
import {walletConnectProjectId} from "./env";

const walletConnectEnabled = walletConnectProjectId !== undefined;

/**
 * Browser-extension wallets (MetaMask, Phantom, Rabby and the rest) are discovered through
 * EIP-6963 and get listed under "Installed" automatically. RainbowKit's dedicated
 * `metaMaskWallet` entry is deliberately left out: it decides "installed" from
 * `window.ethereum.isMetaMask`, which is false whenever another extension owns
 * `window.ethereum`, and it claims the `io.metamask` rdns, which makes wagmi ignore
 * MetaMask's own EIP-6963 announcement. Without it MetaMask appears correctly whenever the
 * extension is present, and mobile users still reach it over WalletConnect.
 */
export const wagmiConfig = getDefaultConfig({
  appName: "SealDrop",
  appDescription: "Lock token supply on Robinhood Chain and get a proof anyone can check.",
  // RainbowKit insists on a non-empty id even when no WalletConnect wallet is listed.
  projectId: walletConnectProjectId ?? "00000000000000000000000000000000",
  chains: [activeChain],
  transports: {[activeChain.id]: http(publicRpcUrl, {batch: true})},
  wallets: [
    {
      groupName: "Popular",
      // Rainbow and WalletConnect both need a real WalletConnect project id for their QR flows.
      wallets: walletConnectEnabled ? [rainbowWallet, coinbaseWallet, walletConnectWallet] : [coinbaseWallet],
    },
  ],
  ssr: true,
  storage: createStorage({storage: cookieStorage}),
});

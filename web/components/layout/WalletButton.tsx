"use client";

import {ConnectButton} from "@rainbow-me/rainbowkit";
import {Warning} from "@phosphor-icons/react";
import {buttonClass} from "@/components/ui/primitives";

/**
 * The four states a connect button actually has, rather than the two it is usually built
 * with: not yet mounted, disconnected, connected to the wrong network, and connected.
 *
 * The wrong-network state is the one that matters. A wallet on another chain signs against
 * an address holding no code there, and the only feedback the user gets is an unexplained
 * "execution reverted", so it has to be impossible to miss before anything is signed.
 */
export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({account, chain, openAccountModal, openChainModal, openConnectModal, mounted}) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              // Reserves the button's space before the wallet state is known, so the header
              // does not reflow a beat after it paints.
              style: {opacity: 0, pointerEvents: "none", userSelect: "none"},
            })}
          >
            {!connected ? (
              // Secondary on purpose. Connecting is chrome, and every page already carries
              // its own primary action; two accent buttons in one view means neither leads.
              <button type="button" onClick={openConnectModal} className={buttonClass("secondary", "sm")}>
                Connect wallet
              </button>
            ) : chain.unsupported ? (
              <button type="button" onClick={openChainModal} className={buttonClass("danger", "sm")}>
                <Warning size={14} weight="bold" aria-hidden />
                Wrong network
              </button>
            ) : (
              <button type="button" onClick={openAccountModal} className={buttonClass("secondary", "sm")}>
                <span className="num">{account.displayName}</span>
              </button>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

// Top-bar wallet control: connect the browser wallet that signs the kill switches, or show which account is connected.
import { useState } from "react";
import { Wallet } from "@phosphor-icons/react";
import { connect, pickAccount, useWallet } from "@/lib/wallet";
import { shortAddr } from "./ui";

export function WalletButton() {
  const { account, available } = useWallet();
  const [error, setError] = useState<string | null>(null);

  if (!available)
    return (
      <a className="wallet-pill" href="https://metamask.io/download/" target="_blank" rel="noreferrer" title="Kill switches are signed in a browser wallet">
        <Wallet size={16} weight="bold" aria-hidden /> Get a wallet
      </a>
    );

  return (
    <button
      type="button"
      className={`wallet-pill${account ? " connected" : ""}`}
      title={error ?? (account ? "Switch account" : "Connect the wallet that signs the kill switches")}
      onClick={() => {
        setError(null);
        (account ? pickAccount() : connect()).catch((e: { code?: number; message?: string }) => setError(e.code === 4001 ? null : (e.message ?? null)));
      }}
    >
      <Wallet size={16} weight="bold" aria-hidden />
      {account ? <span className="mono">{shortAddr(account)}</span> : "Connect wallet"}
    </button>
  );
}

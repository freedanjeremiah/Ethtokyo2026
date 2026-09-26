// app/src/lib/wallet.ts — the viewer's injected browser wallet (EIP-1193, e.g. MetaMask). Client only.
//
// Kill switches are signed here, never on the server: the wallet holds the keys and shows each transaction.

import { useEffect, useState } from "react";
import { type Address, type EIP1193Provider, type Hash, createPublicClient, custom, getAddress } from "viem";
import type { TxStep } from "./fleet-types";

/** Sepolia, which the anvil fork also reports. */
export const CHAIN_ID = 11155111;

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export function provider(): EIP1193Provider | null {
  return typeof window !== "undefined" && window.ethereum ? window.ethereum : null;
}

export async function connectedAccount(): Promise<Address | null> {
  const eth = provider();
  if (!eth) return null;
  const accounts = await eth.request({ method: "eth_accounts" });
  return accounts[0] ? getAddress(accounts[0]) : null;
}

/** Fired after this page connects or switches accounts, so every useWallet() agrees even if the wallet stays quiet. */
const CHANGED = "fns:wallet";
function announce(account: Address | null) {
  window.dispatchEvent(new CustomEvent<Address | null>(CHANGED, { detail: account }));
}

export async function connect(): Promise<Address | null> {
  const eth = provider();
  if (!eth) throw new Error("No browser wallet found. Install one (e.g. MetaMask) to use the kill switches.");
  const accounts = await eth.request({ method: "eth_requestAccounts" });
  const account = accounts[0] ? getAddress(accounts[0]) : null;
  announce(account);
  return account;
}

/** The connected account (null when none), kept current across wallet switches and every component using it. */
export function useWallet(): { account: Address | null; available: boolean } {
  const [account, setAccount] = useState<Address | null>(null);
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const eth = provider();
    setAvailable(!!eth);
    if (!eth) return;
    connectedAccount().then(setAccount).catch(() => {});
    const onAccounts = (accounts: string[]) => setAccount(accounts[0] ? getAddress(accounts[0]) : null);
    const onAnnounce = (e: Event) => setAccount((e as CustomEvent<Address | null>).detail);
    eth.on("accountsChanged", onAccounts);
    window.addEventListener(CHANGED, onAnnounce);
    return () => {
      eth.removeListener("accountsChanged", onAccounts);
      window.removeEventListener(CHANGED, onAnnounce);
    };
  }, []);
  return { account, available };
}

/** Opens the wallet's account picker, so the viewer can switch to the account a step needs. */
export async function pickAccount(): Promise<Address | null> {
  const eth = provider();
  if (!eth) return null;
  await eth.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
  const account = await connectedAccount();
  announce(account);
  return account;
}

async function ensureChain(eth: EIP1193Provider) {
  const id = Number(await eth.request({ method: "eth_chainId" }));
  if (id === CHAIN_ID) return;
  await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }] });
}

/** Asks the wallet to send one planned step from the connected account. Resolves once the viewer approves it. */
export async function sendStep(s: TxStep): Promise<Hash> {
  const eth = provider();
  if (!eth) throw new Error("No browser wallet found.");
  await ensureChain(eth);
  return eth.request({ method: "eth_sendTransaction", params: [{ from: s.from, to: s.to, data: s.data }] });
}

/** Waits for a sent step to be mined, fails if it reverted, and returns the block it landed in. */
export async function waitForReceipt(s: TxStep, hash: Hash): Promise<bigint> {
  const eth = provider();
  if (!eth) throw new Error("No browser wallet found.");
  const receipt = await createPublicClient({ transport: custom(eth) }).waitForTransactionReceipt({ hash, pollingInterval: 2_000 });
  if (receipt.status !== "success") throw new Error(`${s.what}: transaction ${hash} reverted`);
  return receipt.blockNumber;
}

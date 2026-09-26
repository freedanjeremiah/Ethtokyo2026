// scripts/lib/names.ts
//
// Obtains `.eth` names for ENF actors via the REAL ETHRegistrar
// commit/reveal flow (docs/ensv2-notes.md §3.1) — the same flow on an anvil
// fork (using evm_increaseTime/evm_mine to skip the commitment wait) and on
// live Sepolia (a real wall-clock wait). We use the real flow rather than
// anvil_impersonateAccount because the notes confirm it works end-to-end on
// a fork with funded ETH + the permissionless MockUSDC.mint shortcut for
// payment — impersonation was only an optional fallback the notes didn't
// need either.
//
// The `subregistry` passed at registration is the zero address: mounting a
// `support` UserRegistry under each name is Task 4's job (fleet setup), not
// this harness. `ETHRegistry.setSubregistry` can be called by the owner
// later since registration grants ROLE_SET_SUBREGISTRY on the token.

import { randomBytes } from "node:crypto";
import { type Address, type PublicClient, zeroAddress, zeroHash } from "viem";
import { normalize } from "viem/ens";
import { type ActorWalletClient, type ChainKind, detectChainKind, publicClient as defaultPublicClient } from "./env.js";
import { contractOf } from "./deployment.js";

/** Registration period for names this harness registers: 1 year (comfortably above MIN_REGISTER_DURATION = 28 days). */
export const REGISTRATION_DURATION_SECONDS = 365n * 24n * 60n * 60n;

const REFERRER = zeroHash;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type RegisterResult = { label: string; owner: Address; status: "already-owned" | "registered" };

/**
 * Ensures `${label}.eth` is owned by `ownerWallet`'s account, registering it
 * via the real ETHRegistrar flow if it isn't already.
 *
 * Idempotent: if the name is already owned by the intended owner, this is a
 * no-op. Fails loudly if it's owned by anyone else (never silently
 * reassigns a live name).
 *
 * `ownerWallet`'s account pays throughout: MockUSDC is minted to it
 * (permissionless per docs/ensv2-notes.md §3.1) and approved from it, and it
 * sends the commit/register transactions, so `msg.sender === owner`.
 */
export async function ensureEthNameOwnedBy(
  label: string,
  ownerWallet: ActorWalletClient,
  publicClient: PublicClient = defaultPublicClient,
): Promise<RegisterResult> {
  const normalizedLabel = normalize(label);
  const owner = ownerWallet.account.address;

  const registrar = contractOf("ETHRegistrar");
  const registry = contractOf("ETHRegistry");
  const usdc = contractOf("MockUSDC");

  const currentOwner = (await publicClient.readContract({
    ...registry,
    functionName: "findOwner",
    args: [normalizedLabel],
  })) as Address;

  if (currentOwner.toLowerCase() === owner.toLowerCase()) {
    return { label: normalizedLabel, owner, status: "already-owned" };
  }
  if (currentOwner !== zeroAddress) {
    throw new Error(
      `${normalizedLabel}.eth is already owned by ${currentOwner}, not the intended owner ${owner} — refusing to touch it`,
    );
  }

  const chainKind = await detectChainKind(publicClient);
  const secret = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
  const duration = REGISTRATION_DURATION_SECONDS;

  const commitment = (await publicClient.readContract({
    ...registrar,
    functionName: "makeCommitment",
    args: [normalizedLabel, owner, secret, zeroAddress, zeroAddress, duration, REFERRER],
  })) as `0x${string}`;

  const commitHash = await ownerWallet.writeContract({
    ...registrar,
    functionName: "commit",
    args: [commitment],
  });
  await publicClient.waitForTransactionReceipt({ hash: commitHash });

  const minAge = (await publicClient.readContract({ ...registrar, functionName: "MIN_COMMITMENT_AGE" })) as bigint;
  await waitCommitmentAge(chainKind, publicClient, minAge);

  const [base, premium] = (await publicClient.readContract({
    ...registrar,
    functionName: "getRegisterPrice",
    args: [normalizedLabel, duration, usdc.address],
  })) as [bigint, bigint];
  const price = base + premium;

  const mintHash = await ownerWallet.writeContract({
    ...usdc,
    functionName: "mint",
    args: [owner, price],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });

  const approveHash = await ownerWallet.writeContract({
    ...usdc,
    functionName: "approve",
    args: [registrar.address, price],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });

  const registerHash = await ownerWallet.writeContract({
    ...registrar,
    functionName: "register",
    args: [normalizedLabel, owner, secret, zeroAddress, zeroAddress, duration, usdc.address, REFERRER],
  });
  await publicClient.waitForTransactionReceipt({ hash: registerHash });

  const finalOwner = (await publicClient.readContract({
    ...registry,
    functionName: "findOwner",
    args: [normalizedLabel],
  })) as Address;
  if (finalOwner.toLowerCase() !== owner.toLowerCase()) {
    throw new Error(`register() succeeded but findOwner(${normalizedLabel}) = ${finalOwner}, expected ${owner}`);
  }

  return { label: normalizedLabel, owner, status: "registered" };
}

async function waitCommitmentAge(chainKind: ChainKind, publicClient: PublicClient, minAgeSeconds: bigint): Promise<void> {
  const bufferedSeconds = Number(minAgeSeconds) + 5;
  if (chainKind === "anvil") {
    await publicClient.request({ method: "evm_increaseTime", params: [bufferedSeconds] } as never);
    await publicClient.request({ method: "evm_mine", params: [] } as never);
  } else {
    console.log(`  waiting ${bufferedSeconds}s (real time) for the commitment to mature on live Sepolia...`);
    await sleep(bufferedSeconds * 1000);
  }
}

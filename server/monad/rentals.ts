import { getAddress, isAddress, isAddressEqual, parseEventLogs, type Hex } from "viem";

import { kyralRentalsAbi } from "@/lib/abi/kyral-rentals";
import { RENTALS_ADDRESS, bountyIdFor } from "@/lib/chain";
import { getOperatorClient, getPublicClient } from "./config";

const contract = { address: RENTALS_ADDRESS, abi: kyralRentalsAbi } as const;

export async function quoteRentalDeposit(ratePerSecondUsdc: number, durationSeconds: number, seats: number) {
  const [total, feePerSecond] = await getPublicClient().readContract({
    ...contract,
    functionName: "rentalDeposit",
    args: [BigInt(ratePerSecondUsdc), BigInt(durationSeconds), seats],
  });
  return { total, feePerSecond };
}

/** Check `txHash` escrowed this rental with the agreed terms; returns when it ends. */
export async function verifyRentalFunding(args: {
  txHash: Hex;
  bountyId: string;
  funder: string;
  ratePerSecondUsdc: number;
  maxContributors: number;
}): Promise<Date | null> {
  if (!isAddress(args.funder)) return null;
  const receipt = await getPublicClient().waitForTransactionReceipt({ hash: args.txHash, timeout: 30_000 });
  if (receipt.status !== "success") return null;

  const created = parseEventLogs({
    abi: kyralRentalsAbi,
    eventName: "RentalCreated",
    logs: receipt.logs.filter((l) => isAddressEqual(l.address, RENTALS_ADDRESS)),
  }).find((l) => l.args.rentalId === bountyIdFor(args.bountyId));

  const ok =
    !!created &&
    isAddressEqual(created.args.renter, getAddress(args.funder)) &&
    created.args.ratePerSecond === BigInt(args.ratePerSecondUsdc) &&
    created.args.maxSeats === args.maxContributors;
  return ok ? new Date(Number(created.args.endsAt) * 1000) : null;
}

async function confirm(txHash: Hex, label: string) {
  const receipt = await getPublicClient().waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${txHash}`);
  return receipt;
}

/** Seat a contributor; they earn from this block until the rental ends. */
export async function joinRentalOnchain(bountyId: string, contributor: string, dataHash: Hex): Promise<Hex> {
  if (!isAddress(contributor)) throw new Error("Contributor wallet is not an EVM address");
  const txHash = await getOperatorClient().writeContract({
    ...contract,
    functionName: "joinRental",
    args: [bountyIdFor(bountyId), getAddress(contributor), dataHash],
  });
  await confirm(txHash, "joinRental");
  return txHash;
}

/** Stop now (if still running) and settle: fee to treasury, unused time back to the renter. */
export async function endRentalOnchain(bountyId: string, stillRunning: boolean): Promise<{ txHash: Hex; refund: bigint }> {
  const operator = getOperatorClient();
  const rentalId = bountyIdFor(bountyId);
  if (stillRunning) {
    await confirm(await operator.writeContract({ ...contract, functionName: "stopRental", args: [rentalId] }), "stopRental");
  }
  const txHash = await operator.writeContract({ ...contract, functionName: "settleRental", args: [rentalId] });
  const receipt = await confirm(txHash, "settleRental");
  const [settled] = parseEventLogs({ abi: kyralRentalsAbi, eventName: "RentalSettled", logs: receipt.logs });
  return { txHash, refund: settled?.args.refund ?? 0n };
}

async function sumAcross(functionName: "claimable" | "earned", bountyIds: string[], account: string) {
  if (bountyIds.length === 0 || !isAddress(account)) return 0n;
  const results = await getPublicClient().multicall({
    contracts: bountyIds.map((id) => ({
      ...contract,
      functionName,
      args: [bountyIdFor(id), getAddress(account)] as const,
    })),
  });
  return results.reduce((sum, r) => sum + (r.status === "success" ? (r.result as bigint) : 0n), 0n);
}

/** What `account` can withdraw right now across these rentals. */
export function readRentalClaimable(bountyIds: string[], account: string) {
  return sumAcross("claimable", bountyIds, account);
}

/** Everything `account` has earned across these rentals, claimed or not. */
export function readRentalEarned(bountyIds: string[], account: string) {
  return sumAcross("earned", bountyIds, account);
}

/** Relay a claim across rentals; USDC goes straight to `account`. */
export async function relayRentalClaim(bountyIds: string[], account: string): Promise<{ txHash: Hex | null; amount: bigint }> {
  const amount = await readRentalClaimable(bountyIds, account);
  if (amount === 0n) return { txHash: null, amount: 0n };
  const txHash = await getOperatorClient().writeContract({
    ...contract,
    functionName: "claimFor",
    args: [bountyIds.map(bountyIdFor), getAddress(account)],
  });
  const receipt = await getPublicClient().waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`claimFor reverted: ${txHash}`);
  const [claimed] = parseEventLogs({ abi: kyralRentalsAbi, eventName: "Claimed", logs: receipt.logs });
  return { txHash, amount: claimed?.args.amount ?? amount };
}

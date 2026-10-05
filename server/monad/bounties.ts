import { getAddress, isAddress, isAddressEqual, parseEventLogs, type Hex } from "viem";

import { kyralMarketplaceAbi } from "@/lib/abi/kyral-marketplace";
import { MARKETPLACE_ADDRESS, bountyIdFor } from "@/lib/chain";
import { getOperatorClient, getPublicClient } from "./config";

const contract = { address: MARKETPLACE_ADDRESS, abi: kyralMarketplaceAbi } as const;

export async function quoteBountyDeposit(rewardUsdc: number, maxContributors: number) {
  const [total, feePerFill] = await getPublicClient().readContract({
    ...contract,
    functionName: "bountyDeposit",
    args: [BigInt(rewardUsdc), maxContributors],
  });
  return { total, feePerFill };
}

/** Check `txHash` escrowed this bounty with the agreed terms. */
export async function verifyBountyFunding(args: {
  txHash: Hex;
  bountyId: string;
  funder: string;
  rewardUsdc: number;
  maxContributors: number;
}): Promise<boolean> {
  if (!isAddress(args.funder)) return false;
  const receipt = await getPublicClient().waitForTransactionReceipt({
    hash: args.txHash,
    timeout: 30_000,
  });
  if (receipt.status !== "success") return false;

  const created = parseEventLogs({
    abi: kyralMarketplaceAbi,
    eventName: "BountyCreated",
    logs: receipt.logs.filter((l) => isAddressEqual(l.address, MARKETPLACE_ADDRESS)),
  }).find((l) => l.args.bountyId === bountyIdFor(args.bountyId));

  return (
    !!created &&
    isAddressEqual(created.args.funder, getAddress(args.funder)) &&
    created.args.reward === BigInt(args.rewardUsdc) &&
    created.args.maxFills === args.maxContributors
  );
}

/** Pay a contributor from the bounty's escrow. */
export async function fillBountyOnchain(bountyId: string, contributor: string, dataHash: Hex): Promise<Hex> {
  if (!isAddress(contributor)) throw new Error("Contributor wallet is not an EVM address");
  const publicClient = getPublicClient();
  const txHash = await getOperatorClient().writeContract({
    ...contract,
    functionName: "fillBounty",
    args: [bountyIdFor(bountyId), getAddress(contributor), dataHash],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`fillBounty reverted: ${txHash}`);
  return txHash;
}

/** Close early; the contract refunds unfilled slots straight to the funder. */
export async function closeBountyOnchain(bountyId: string): Promise<{ txHash: Hex; refund: bigint }> {
  const publicClient = getPublicClient();
  const txHash = await getOperatorClient().writeContract({
    ...contract,
    functionName: "closeBounty",
    args: [bountyIdFor(bountyId)],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`closeBounty reverted: ${txHash}`);
  const [closed] = parseEventLogs({ abi: kyralMarketplaceAbi, eventName: "BountyClosed", logs: receipt.logs });
  return { txHash, refund: closed?.args.refund ?? 0n };
}

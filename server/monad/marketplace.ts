import { and, asc, eq, inArray } from "drizzle-orm";
import {
  getAddress,
  isAddress,
  isAddressEqual,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";

import { kyralMarketplaceAbi } from "@/lib/abi/kyral-marketplace";
import {
  MARKETPLACE_ADDRESS,
  itemIdFor,
  purchaseRefFor,
  type ItemType,
} from "@/lib/chain";
import { db } from "@/server/db";
import {
  dataListings,
  datasetContributions,
  datasets,
  documents,
} from "@/server/db/schema";
import { getOperatorClient, getPublicClient } from "./config";
import { commitToHashes } from "./provenance";

interface ItemState {
  price: bigint;
  contentHash: Hex;
  recipients: Address[];
  active: boolean;
}

const contract = { address: MARKETPLACE_ADDRESS, abi: kyralMarketplaceAbi } as const;

function toEvmAddress(wallet: string | null | undefined): Address | null {
  return wallet && isAddress(wallet) ? getAddress(wallet) : null;
}

async function documentHashesById(documentIds: string[]) {
  if (documentIds.length === 0) return new Map<string, string | null>();
  const docs = await db.query.documents.findMany({
    where: inArray(documents.id, documentIds),
    columns: { id: true, sha256: true, deidSha256: true },
  });
  // Commit to what buyers actually receive.
  return new Map(docs.map((d) => [d.id, d.deidSha256 ?? d.sha256]));
}

async function loadListingState(id: string): Promise<ItemState | null> {
  const listing = await db.query.dataListings.findFirst({
    where: eq(dataListings.id, id),
    with: { owner: true },
  });
  if (!listing) return null;

  const hashes = await documentHashesById(listing.documentIds);
  const owner = toEvmAddress(listing.owner.walletAddress);

  return {
    price: BigInt(listing.priceUsdc),
    contentHash: commitToHashes([...hashes.values()]),
    recipients: owner ? [owner] : [],
    active: listing.status === "active",
  };
}

async function loadDatasetState(id: string): Promise<ItemState | null> {
  const dataset = await db.query.datasets.findFirst({
    where: eq(datasets.id, id),
  });
  if (!dataset) return null;

  const contributions = await db.query.datasetContributions.findMany({
    where: and(
      eq(datasetContributions.datasetId, id),
      eq(datasetContributions.status, "active")
    ),
    with: { contributor: true, listing: true },
    orderBy: [asc(datasetContributions.joinedAt)],
  });

  const hashes = await documentHashesById(
    contributions.flatMap((c) => c.listing.documentIds)
  );
  const listingCommitments = contributions.map((c) =>
    commitToHashes(c.listing.documentIds.map((docId) => hashes.get(docId)))
  );
  const recipients = contributions
    .map((c) => toEvmAddress(c.contributor.walletAddress))
    .filter((a): a is Address => a !== null);

  return {
    price: BigInt(dataset.priceUsdc),
    contentHash: commitToHashes(listingCommitments),
    recipients,
    active: dataset.status !== "archived",
  };
}

function sameRecipients(a: readonly Address[], b: readonly Address[]) {
  return a.length === b.length && a.every((addr, i) => isAddressEqual(addr, b[i]!));
}

async function recordAnchor(
  type: ItemType,
  id: string,
  anchor: { contentHash: Hex; version: number; txHash: Hex }
) {
  const values = {
    onchainContentHash: anchor.contentHash,
    onchainVersion: anchor.version,
    onchainTxHash: anchor.txHash,
    onchainSyncedAt: new Date(),
  };
  if (type === "listing") {
    await db.update(dataListings).set(values).where(eq(dataListings.id, id));
  } else {
    await db.update(datasets).set(values).where(eq(datasets.id, id));
  }
}

export interface SyncResult {
  itemId: Hex;
  purchasable: boolean;
  price: bigint;
  txHash: Hex | null;
}

/**
 * Bring the onchain item in line with the database: price, content hash, and
 * payout recipients. No-op when already in sync.
 */
export async function syncItem(type: ItemType, id: string): Promise<SyncResult> {
  const itemId = itemIdFor(type, id);
  const publicClient = getPublicClient();
  const operator = getOperatorClient();

  const [state, onchain] = await Promise.all([
    type === "listing" ? loadListingState(id) : loadDatasetState(id),
    publicClient.readContract({ ...contract, functionName: "getItem", args: [itemId] }),
  ]);
  const [price, version, active, contentHash, recipients] = onchain;

  const shouldBeActive = !!state && state.active && state.recipients.length > 0;

  if (!shouldBeActive) {
    let txHash: Hex | null = null;
    if (version > 0n && active) {
      txHash = await operator.writeContract({
        ...contract,
        functionName: "setItemActive",
        args: [itemId, false],
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
    }
    return { itemId, purchasable: false, price: state?.price ?? 0n, txHash };
  }

  const inSync =
    active &&
    price === state.price &&
    contentHash.toLowerCase() === state.contentHash.toLowerCase() &&
    sameRecipients(recipients, state.recipients);
  if (inSync) {
    return { itemId, purchasable: true, price, txHash: null };
  }

  const txHash = await operator.writeContract({
    ...contract,
    functionName: "upsertItem",
    args: [itemId, state.price, state.contentHash, state.recipients, true],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error(`upsertItem reverted: ${txHash}`);
  }

  const [upserted] = parseEventLogs({
    abi: kyralMarketplaceAbi,
    eventName: "ItemUpserted",
    logs: receipt.logs,
  });
  await recordAnchor(type, id, {
    contentHash: state.contentHash,
    version: Number(upserted?.args.version ?? version + 1n),
    txHash,
  });

  return { itemId, purchasable: true, price: state.price, txHash };
}

/** Best-effort sync for mutation routes; failures are retried at purchase time. */
export async function syncItemSafe(type: ItemType, id: string) {
  try {
    await syncItem(type, id);
  } catch (error) {
    console.error(`Onchain sync failed for ${type} ${id}`, error);
  }
}

export interface VerifiedPurchase {
  price: bigint;
  fee: bigint;
  credits: { recipient: Address; amount: bigint }[];
}

/**
 * Confirm that `txHash` executed a KyralMarketplace purchase for this exact
 * order and buyer, and return how the revenue was split onchain.
 */
export async function verifyPurchase(args: {
  txHash: Hex;
  purchaseId: string;
  type: ItemType;
  targetId: string;
  buyer: string;
}): Promise<VerifiedPurchase | null> {
  const receipt = await getPublicClient().waitForTransactionReceipt({
    hash: args.txHash,
    timeout: 30_000,
  });
  if (receipt.status !== "success") return null;

  const logs = parseEventLogs({
    abi: kyralMarketplaceAbi,
    logs: receipt.logs.filter((l) => isAddressEqual(l.address, MARKETPLACE_ADDRESS)),
  });

  const itemId = itemIdFor(args.type, args.targetId);
  const purchaseRef = purchaseRefFor(args.purchaseId);
  const buyer = toEvmAddress(args.buyer);

  const purchased = logs.find(
    (l) => l.eventName === "Purchased" && l.args.purchaseRef === purchaseRef
  );
  if (
    !purchased ||
    purchased.eventName !== "Purchased" ||
    purchased.args.itemId !== itemId ||
    !buyer ||
    !isAddressEqual(purchased.args.buyer, buyer)
  ) {
    return null;
  }

  const credits = logs.flatMap((l) =>
    l.eventName === "RevenueCredited" && l.args.itemId === itemId
      ? [{ recipient: l.args.recipient, amount: l.args.amount }]
      : []
  );

  return { price: purchased.args.price, fee: purchased.args.fee, credits };
}

export async function readClaimable(wallet: string): Promise<bigint> {
  const account = toEvmAddress(wallet);
  if (!account) return 0n;
  return getPublicClient().readContract({
    ...contract,
    functionName: "claimable",
    args: [account],
  });
}

/** Relay a claim so users without MON for gas can still withdraw. */
export async function relayClaim(wallet: string): Promise<{ amount: bigint; txHash: Hex | null }> {
  const account = toEvmAddress(wallet);
  if (!account) throw new Error("Wallet is not an EVM address");

  const amount = await readClaimable(account);
  if (amount === 0n) return { amount, txHash: null };

  const publicClient = getPublicClient();
  const txHash = await getOperatorClient().writeContract({
    ...contract,
    functionName: "claimFor",
    args: [account],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error(`claimFor reverted: ${txHash}`);
  }

  const [claimed] = parseEventLogs({
    abi: kyralMarketplaceAbi,
    eventName: "Claimed",
    logs: receipt.logs,
  });
  return { amount: claimed?.args.amount ?? amount, txHash };
}

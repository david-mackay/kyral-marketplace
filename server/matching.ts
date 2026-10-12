import { and, eq, isNotNull, lt, ne, sql } from "drizzle-orm";
import { zeroHash, type Hex } from "viem";

import type { DataProfile } from "@/lib/data-profile";
import { formatUsdc } from "@/lib/format";
import { recordActivity } from "@/server/activity";
import { matchesCriteria } from "@/server/criteria";
import { db } from "@/server/db";
import {
  bounties,
  bountyFills,
  documents,
  users,
  type Bounty,
  type Document,
  type User,
} from "@/server/db/schema";
import { fillBountyOnchain } from "@/server/monad/bounties";

type ShareableDoc = Document & { profile: DataProfile };

function isShareable(doc: Document): doc is ShareableDoc {
  return !!doc.profile && !!doc.deidObjectKey;
}

function eligible(bounty: Bounty, user: User) {
  return user.autoFill && bounty.creatorUserId !== user.id && user.consentPurposes.includes(bounty.purpose);
}

export interface Payout {
  bountyId: string;
  title: string;
  organization: string | null;
  rewardUsdc: number;
  txHash: Hex;
}

/**
 * Reserve a slot, pay the contributor from escrow, and record it. Returns
 * null if the bounty filled up or this person already contributed.
 */
async function fill(bounty: Bounty, user: User, doc: ShareableDoc): Promise<Payout | null> {
  const [reserved] = await db
    .update(bounties)
    .set({ filledCount: sql`${bounties.filledCount} + 1` })
    .where(
      and(
        eq(bounties.id, bounty.id),
        eq(bounties.status, "open"),
        lt(bounties.filledCount, bounties.maxContributors)
      )
    )
    .returning();
  if (!reserved) return null;

  const releaseSlot = () =>
    db
      .update(bounties)
      .set({ filledCount: sql`GREATEST(${bounties.filledCount} - 1, 0)` })
      .where(eq(bounties.id, bounty.id));

  const [row] = await db
    .insert(bountyFills)
    .values({
      bountyId: bounty.id,
      contributorUserId: user.id,
      documentId: doc.id,
      rewardUsdc: bounty.rewardUsdc,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    await releaseSlot();
    return null;
  }

  let txHash: Hex;
  try {
    txHash = await fillBountyOnchain(bounty.id, user.walletAddress, (doc.deidSha256 as Hex | null) ?? zeroHash);
  } catch (error) {
    console.error(`Onchain fill failed for bounty ${bounty.id}`, error);
    await db.delete(bountyFills).where(eq(bountyFills.id, row.id));
    await releaseSlot();
    return null;
  }

  await db.update(bountyFills).set({ txHash }).where(eq(bountyFills.id, row.id));
  if (reserved.filledCount >= reserved.maxContributors) {
    await db.update(bounties).set({ status: "filled" }).where(eq(bounties.id, bounty.id));
  }

  const who = bounty.organization ?? "A research team";
  await recordActivity(
    {
      userId: user.id,
      kind: "bounty_filled",
      title: `Your ${doc.profile.documentType.toLowerCase()} joined "${bounty.title}"`,
      detail: `${who} · ${bounty.purpose} research`,
      amountUsdc: bounty.rewardUsdc,
      href: `/requests/${bounty.id}`,
      txHash,
    },
    {
      userId: bounty.creatorUserId,
      kind: "bounty_delivery",
      title: `New contributor for "${bounty.title}"`,
      detail: `${reserved.filledCount} of ${reserved.maxContributors} filled · ${formatUsdc(bounty.rewardUsdc)} paid from escrow`,
      href: `/requests/${bounty.id}`,
      txHash,
    }
  );
  return { bountyId: bounty.id, title: bounty.title, organization: bounty.organization, rewardUsdc: bounty.rewardUsdc, txHash };
}

async function shareableDocsFor(userId: string) {
  const docs = await db.query.documents.findMany({
    where: and(eq(documents.ownerUserId, userId), isNotNull(documents.deidObjectKey)),
    orderBy: (d, { desc }) => [desc(d.createdAt)],
  });
  return docs.filter(isShareable);
}

/** After someone uploads: offer their data to every open request it fits. */
export async function fillRequestsForUser(userId: string): Promise<Payout[]> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user?.autoFill) return [];

  const [docs, open, already] = await Promise.all([
    shareableDocsFor(userId),
    db.query.bounties.findMany({
      where: and(eq(bounties.status, "open"), ne(bounties.creatorUserId, userId)),
      orderBy: (b, { desc }) => [desc(b.rewardUsdc)],
    }),
    db.query.bountyFills.findMany({ where: eq(bountyFills.contributorUserId, userId) }),
  ]);
  const done = new Set(already.map((f) => f.bountyId));

  const payouts: Payout[] = [];
  for (const bounty of open) {
    if (done.has(bounty.id) || !eligible(bounty, user)) continue;
    const doc = docs.find((d) => matchesCriteria(bounty.criteria, d.profile));
    const payout = doc && (await fill(bounty, user, doc));
    if (payout) payouts.push(payout);
  }
  return payouts;
}

/** After a request is funded: fill it from everyone who has opted in. */
export async function fillRequestFromPool(bountyId: string) {
  const bounty = await db.query.bounties.findFirst({ where: eq(bounties.id, bountyId) });
  if (!bounty || bounty.status !== "open") return 0;

  const candidates = await db.query.documents.findMany({
    where: isNotNull(documents.deidObjectKey),
    with: { owner: true },
    orderBy: (d, { desc }) => [desc(d.createdAt)],
  });

  const tried = new Set<string>();
  let filled = 0;
  for (const doc of candidates) {
    if (filled >= bounty.maxContributors - bounty.filledCount) break;
    if (tried.has(doc.ownerUserId) || !isShareable(doc)) continue;
    if (!eligible(bounty, doc.owner) || !matchesCriteria(bounty.criteria, doc.profile)) continue;
    tried.add(doc.ownerUserId);
    if (await fill(bounty, doc.owner, doc)) filled++;
  }
  return filled;
}

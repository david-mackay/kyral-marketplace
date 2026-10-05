import { NextResponse } from "next/server";
import { and, desc, eq, ne } from "drizzle-orm";

import type { DataProfile } from "@/lib/data-profile";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  bounties,
  bountyFills,
  dataListings,
  documents,
  revenueEvents,
  users,
} from "@/server/db/schema";
import { matchesCriteria } from "@/server/criteria";
import { readClaimable } from "@/server/monad/marketplace";

export const runtime = "nodejs";

/** Everything the patient home screen needs in one round trip. */
export async function GET() {
  try {
    const authUser = await requireAuthenticatedUser();
    const user = await db.query.users.findFirst({ where: eq(users.id, authUser.id) });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [claimable, sales, fills, docs, listings, openBounties] = await Promise.all([
      readClaimable(user.walletAddress).catch(() => 0n),
      db.query.revenueEvents.findMany({ where: eq(revenueEvents.recipientUserId, user.id) }),
      db.query.bountyFills.findMany({
        where: eq(bountyFills.contributorUserId, user.id),
        with: { bounty: true },
        orderBy: [desc(bountyFills.createdAt)],
      }),
      db.query.documents.findMany({
        where: eq(documents.ownerUserId, user.id),
        orderBy: [desc(documents.createdAt)],
      }),
      db.query.dataListings.findMany({ where: eq(dataListings.ownerUserId, user.id) }),
      db.query.bounties.findMany({
        where: and(eq(bounties.status, "open"), ne(bounties.creatorUserId, user.id)),
      }),
    ]);

    const lifetimeUsdc =
      sales.reduce((sum, e) => sum + e.amountUsdc, 0) +
      fills.reduce((sum, f) => sum + f.rewardUsdc, 0);

    const filledBountyIds = new Set(fills.map((f) => f.bountyId));
    const profiles = docs.filter((d) => d.profile && d.deidObjectKey).map((d) => d.profile as DataProfile);

    // Requests this person's data fits but their consent settings exclude.
    const lockedByConsent = openBounties.filter(
      (b) =>
        !filledBountyIds.has(b.id) &&
        !user.consentPurposes.includes(b.purpose) &&
        profiles.some((p) => matchesCriteria(b.criteria, p))
    );

    return NextResponse.json({
      availableUsdc: Number(claimable),
      lifetimeUsdc,
      settings: { consentPurposes: user.consentPurposes, autoFill: user.autoFill },
      data: docs.map((d) => {
        const listing = listings.find((l) => l.documentIds.includes(d.id));
        return {
          id: d.id,
          fileName: d.originalFileName,
          status: d.status,
          profile: d.profile,
          shareable: !!d.deidObjectKey,
          createdAt: d.createdAt,
          listing: listing
            ? { id: listing.id, priceUsdc: listing.priceUsdc, status: listing.status }
            : null,
          requestsJoined: fills.filter((f) => f.documentId === d.id).length,
        };
      }),
      participation: fills.map((f) => ({
        bountyId: f.bountyId,
        title: f.bounty.title,
        organization: f.bounty.organization,
        purpose: f.bounty.purpose,
        rewardUsdc: f.rewardUsdc,
        txHash: f.txHash,
        createdAt: f.createdAt,
      })),
      lockedOpportunities: lockedByConsent.map((b) => ({
        id: b.id,
        title: b.title,
        organization: b.organization,
        purpose: b.purpose,
        rewardUsdc: b.rewardUsdc,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    console.error("/api/earn GET error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

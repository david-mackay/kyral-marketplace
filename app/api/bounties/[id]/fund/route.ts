import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import type { Hex } from "viem";
import { z } from "zod";

import { formatUsdc } from "@/lib/format";
import { recordActivity } from "@/server/activity";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { bounties } from "@/server/db/schema";
import { fillRequestFromPool } from "@/server/matching";
import { verifyBountyFunding } from "@/server/monad/bounties";
import { verifyRentalFunding } from "@/server/monad/rentals";
import { formatRate } from "@/lib/bounties";

export const runtime = "nodejs";
export const maxDuration = 120;

const FundSchema = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

/** Confirm the escrow deposit, open the request, and fill it from the pool. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthenticatedUser();
    const { id } = await params;
    const { txHash } = FundSchema.parse(await req.json());

    const bounty = await db.query.bounties.findFirst({
      where: and(eq(bounties.id, id), eq(bounties.creatorUserId, user.id)),
    });
    if (!bounty) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (bounty.status !== "awaiting_funding") {
      return NextResponse.json({ ok: true, bounty });
    }

    const rental = bounty.ratePerSecondUsdc != null;
    const rentalEndsAt = rental
      ? await verifyRentalFunding({
          txHash: txHash as Hex,
          bountyId: bounty.id,
          funder: user.walletAddress,
          ratePerSecondUsdc: bounty.ratePerSecondUsdc!,
          maxContributors: bounty.maxContributors,
        })
      : null;
    const funded = rental
      ? !!rentalEndsAt
      : await verifyBountyFunding({
          txHash: txHash as Hex,
          bountyId: bounty.id,
          funder: user.walletAddress,
          rewardUsdc: bounty.rewardUsdc,
          maxContributors: bounty.maxContributors,
        });
    if (!funded) {
      return NextResponse.json({ error: "Could not verify the deposit" }, { status: 400 });
    }

    const [opened] = await db
      .update(bounties)
      .set({ status: "open", fundingTxHash: txHash, rentalEndsAt })
      .where(and(eq(bounties.id, id), eq(bounties.status, "awaiting_funding")))
      .returning();

    if (opened) {
      await recordActivity({
        userId: user.id,
        kind: "bounty_funded",
        title: `"${bounty.title}" is live`,
        detail: rental
          ? `Renting at ${formatRate(bounty.ratePerSecondUsdc!)} per person, ${formatUsdc(bounty.rewardUsdc * bounty.maxContributors)} held in escrow`
          : `${formatUsdc(bounty.rewardUsdc * bounty.maxContributors)} in rewards held in escrow`,
        href: `/requests/${bounty.id}`,
        txHash,
      });
    }

    const matched = await fillRequestFromPool(bounty.id);
    return NextResponse.json({ ok: true, matched });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.errors }, { status: 400 });
    }
    console.error("/api/bounties/[id]/fund POST error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

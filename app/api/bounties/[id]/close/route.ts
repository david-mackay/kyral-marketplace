import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { rentalEnded } from "@/lib/bounties";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { bounties } from "@/server/db/schema";
import { closeBountyOnchain } from "@/server/monad/bounties";
import { endRentalOnchain } from "@/server/monad/rentals";

export const runtime = "nodejs";

/**
 * Close early. Unused escrow goes back to the researcher's wallet. Rentals
 * stop accruing and lose access immediately; contributors keep what they earned.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthenticatedUser();
    const { id } = await params;

    const bounty = await db.query.bounties.findFirst({
      where: and(eq(bounties.id, id), eq(bounties.creatorUserId, user.id)),
    });
    if (!bounty) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (bounty.status === "awaiting_funding") {
      await db.update(bounties).set({ status: "closed" }).where(eq(bounties.id, id));
      return NextResponse.json({ ok: true, refundUsdc: 0 });
    }

    if (bounty.ratePerSecondUsdc != null) {
      if (bounty.status === "closed") {
        return NextResponse.json({ error: "Rental already ended" }, { status: 400 });
      }
      const stillRunning = !rentalEnded(bounty);
      const { txHash, refund } = await endRentalOnchain(bounty.id, stillRunning);
      await db
        .update(bounties)
        .set({ status: "closed", ...(stillRunning && { rentalEndsAt: new Date() }) })
        .where(eq(bounties.id, id));
      return NextResponse.json({ ok: true, txHash, refundUsdc: Number(refund) });
    }

    if (bounty.status !== "open") {
      return NextResponse.json({ error: "Request is not open" }, { status: 400 });
    }

    const { txHash, refund } = await closeBountyOnchain(bounty.id);
    await db.update(bounties).set({ status: "closed" }).where(eq(bounties.id, id));
    return NextResponse.json({ ok: true, txHash, refundUsdc: Number(refund) });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    console.error("/api/bounties/[id]/close POST error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

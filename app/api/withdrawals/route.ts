import { NextResponse } from "next/server";
import { eq, and, desc, gte, sql } from "drizzle-orm";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { activityEvents, bountyFills, revenueEvents } from "@/server/db/schema";
import { readClaimable, relayClaim } from "@/server/monad/marketplace";
import { relayRentalClaim } from "@/server/monad/rentals";
import { isRental } from "@/lib/bounties";
import { formatUsdc } from "@/lib/format";

export const runtime = "nodejs";

const DAILY_WITHDRAWAL_LIMIT = 2;

/** Midnight UTC of the current day. */
function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * GET /api/withdrawals
 * Returns the user's withdrawal history and their onchain claimable balance.
 */
export async function GET() {
  try {
    const user = await requireAuthenticatedUser();

    const events = await db.query.revenueEvents.findMany({
      where: eq(revenueEvents.recipientUserId, user.id),
      orderBy: [desc(revenueEvents.createdAt)],
    });

    const availableBalance = Number(await readClaimable(user.walletAddress));

    const withdrawals = events.filter(
      (e) => e.status === "confirmed" || e.status === "sent"
    );

    return NextResponse.json({ availableBalance, withdrawals });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    console.error("/api/withdrawals GET error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/withdrawals
 * Withdraw the user's whole onchain balance (sales and request rewards). The
 * server relays KyralMarketplace.claimFor and pays gas; the contract sends
 * USDC straight to the user's wallet, so the recipient can't be redirected.
 *
 * Rate-limited to DAILY_WITHDRAWAL_LIMIT per UTC day because the relay spends
 * operator gas. The limit is checked under a per-user advisory lock so
 * concurrent requests can't both pass it.
 */
export async function POST() {
  try {
    const user = await requireAuthenticatedUser();

    const gate = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`withdraw:${user.id}`}))`);
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.userId, user.id),
            eq(activityEvents.kind, "withdrawal"),
            gte(activityEvents.createdAt, startOfUtcDay())
          )
        );
      if (count >= DAILY_WITHDRAWAL_LIMIT) return false;
      // Reserve today's slot before the slow onchain call.
      await tx.insert(activityEvents).values({
        userId: user.id,
        kind: "withdrawal",
        title: "Withdrawal in progress",
      });
      return true;
    });

    if (!gate) {
      return NextResponse.json(
        { error: `You can withdraw up to ${DAILY_WITHDRAWAL_LIMIT} times per day.` },
        { status: 429 }
      );
    }

    const releaseSlot = () =>
      db.delete(activityEvents).where(
        and(
          eq(activityEvents.userId, user.id),
          eq(activityEvents.kind, "withdrawal"),
          eq(activityEvents.title, "Withdrawal in progress")
        )
      );

    let claimed: Awaited<ReturnType<typeof relayClaim>>;
    try {
      const rentalFills = await db.query.bountyFills.findMany({
        where: eq(bountyFills.contributorUserId, user.id),
        with: { bounty: true },
      });
      const rentalIds = rentalFills.filter((f) => isRental(f.bounty)).map((f) => f.bountyId);
      // Sequential: both are operator transactions and would race for a nonce.
      const sales = await relayClaim(user.walletAddress);
      const rentals = await relayRentalClaim(rentalIds, user.walletAddress);
      claimed = { amount: sales.amount + rentals.amount, txHash: sales.txHash ?? rentals.txHash };
    } catch (error) {
      await releaseSlot();
      console.error("Withdrawal claim failed", error);
      return NextResponse.json(
        { error: "Withdrawal failed. Please try again." },
        { status: 500 }
      );
    }

    if (!claimed.txHash) {
      await releaseSlot();
      return NextResponse.json({ error: "Nothing to withdraw yet" }, { status: 400 });
    }

    await db
      .update(activityEvents)
      .set({
        title: `Withdrew ${formatUsdc(Number(claimed.amount))}`,
        detail: "Sent to your account",
        amountUsdc: Number(claimed.amount),
        txHash: claimed.txHash,
      })
      .where(
        and(
          eq(activityEvents.userId, user.id),
          eq(activityEvents.kind, "withdrawal"),
          eq(activityEvents.title, "Withdrawal in progress")
        )
      );

    await db
      .update(revenueEvents)
      .set({ status: "confirmed", txSignature: claimed.txHash, withdrawnAt: new Date() })
      .where(and(eq(revenueEvents.recipientUserId, user.id), eq(revenueEvents.status, "pending")));

    return NextResponse.json({
      ok: true,
      amountUsdc: Number(claimed.amount),
      txHash: claimed.txHash,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    console.error("/api/withdrawals POST error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

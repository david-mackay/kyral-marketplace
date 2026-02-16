import { NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { revenueEvents } from "@/server/db/schema";
import { sendUsdcFromEscrow } from "@/server/solana/usdc";

export const runtime = "nodejs";

/**
 * GET /api/withdrawals
 * Returns the user's withdrawal history (confirmed revenue events with tx signatures).
 */
export async function GET() {
  try {
    const user = await requireAuthenticatedUser();

    const events = await db.query.revenueEvents.findMany({
      where: eq(revenueEvents.recipientUserId, user.id),
      orderBy: [desc(revenueEvents.createdAt)],
    });

    const availableBalance = events
      .filter((e) => e.status === "pending")
      .reduce((sum, e) => sum + e.amountUsdc, 0);

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
 * Withdraw all available (pending) earnings to the user's wallet.
 * Sums all pending revenue events, sends one USDC transfer, marks them confirmed.
 */
export async function POST() {
  try {
    const user = await requireAuthenticatedUser();

    // Fetch all claimable revenue events
    const claimableEvents = await db.query.revenueEvents.findMany({
      where: and(
        eq(revenueEvents.recipientUserId, user.id),
        eq(revenueEvents.status, "pending")
      ),
    });

    if (claimableEvents.length === 0) {
      return NextResponse.json(
        { error: "No funds available to withdraw" },
        { status: 400 }
      );
    }

    const totalAmount = claimableEvents.reduce(
      (sum, e) => sum + e.amountUsdc,
      0
    );

    if (totalAmount <= 0) {
      return NextResponse.json(
        { error: "Insufficient balance to withdraw" },
        { status: 400 }
      );
    }

    // Mark events as "sent" (in-progress) to prevent double-withdrawal
    const eventIds = claimableEvents.map((e) => e.id);
    for (const eventId of eventIds) {
      await db
        .update(revenueEvents)
        .set({ status: "sent" })
        .where(eq(revenueEvents.id, eventId));
    }

    // Send USDC from escrow to user's wallet
    let txSignature: string;
    try {
      txSignature = await sendUsdcFromEscrow({
        recipientWallet: user.walletAddress,
        amountSmallestUnit: totalAmount,
      });
    } catch (error) {
      // Revert to pending so user can try again
      for (const eventId of eventIds) {
        await db
          .update(revenueEvents)
          .set({ status: "pending" })
          .where(eq(revenueEvents.id, eventId));
      }
      console.error("Withdrawal escrow transfer failed", error);
      return NextResponse.json(
        { error: "Failed to send USDC from escrow. Please try again." },
        { status: 500 }
      );
    }

    // Mark all events as confirmed with the tx signature
    for (const eventId of eventIds) {
      await db
        .update(revenueEvents)
        .set({ status: "confirmed", txSignature })
        .where(eq(revenueEvents.id, eventId));
    }

    return NextResponse.json({
      ok: true,
      amountUsdc: totalAmount,
      txSignature,
      eventsSettled: eventIds.length,
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

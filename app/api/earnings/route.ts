import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { revenueEvents } from "@/server/db/schema";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();

    const events = await db.query.revenueEvents.findMany({
      where: eq(revenueEvents.recipientUserId, user.id),
      orderBy: [desc(revenueEvents.createdAt)],
    });

    // "pending" = claimable (entitlement recorded, not yet withdrawn)
    const availableBalance = events
      .filter((e) => e.status === "pending")
      .reduce((sum, e) => sum + e.amountUsdc, 0);

    // "confirmed" = successfully withdrawn
    const totalWithdrawn = events
      .filter((e) => e.status === "confirmed")
      .reduce((sum, e) => sum + e.amountUsdc, 0);

    // "sent" = withdrawal in progress
    const withdrawalPending = events
      .filter((e) => e.status === "sent")
      .reduce((sum, e) => sum + e.amountUsdc, 0);

    return NextResponse.json({
      events,
      availableBalance,
      totalWithdrawn,
      withdrawalPending,
      totalEvents: events.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    console.error("/api/earnings GET error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

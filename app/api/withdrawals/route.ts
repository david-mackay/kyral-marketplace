import { NextResponse } from "next/server";
import { eq, and, desc, gte, countDistinct } from "drizzle-orm";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { revenueEvents } from "@/server/db/schema";
import { readClaimable, relayClaim } from "@/server/monad/marketplace";

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
 * Withdraw all claimable earnings to the user's wallet. The server relays
 * KyralMarketplace.claimFor (paying gas), and the contract sends USDC straight
 * to the user's wallet.
 *
 * Security properties:
 *  - Authenticated: session JWT required; recipient wallet comes from the
 *    session, never from the request body.
 *  - Atomic: a SELECT … FOR UPDATE inside a DB transaction locks the pending
 *    rows for this user so concurrent requests cannot double-claim the same
 *    events.
 *  - Rate-limited: max DAILY_WITHDRAWAL_LIMIT distinct withdrawals per UTC day
 *    per user, enforced inside the same transaction so the check and the write
 *    are serialized together.
 */
export async function POST() {
  try {
    const user = await requireAuthenticatedUser();

    // Capture the batch timestamp before entering the transaction so every
    // event in this batch gets the exact same withdrawnAt value, which is
    // what we COUNT(DISTINCT ...) for rate-limiting.
    const withdrawnAt = new Date();
    const todayStart = startOfUtcDay();

    // ── Atomic claim phase ────────────────────────────────────────────────────
    // Everything inside this transaction is serialized per-user by the
    // FOR UPDATE row lock, so two concurrent withdrawal requests cannot both
    // proceed past this block.
    const claimResult = await db.transaction(async (tx) => {
      // 1. Lock all pending events for this user.  Any concurrent request will
      //    block here until we commit or roll back.
      const claimableEvents = await tx
        .select()
        .from(revenueEvents)
        .where(
          and(
            eq(revenueEvents.recipientUserId, user.id),
            eq(revenueEvents.status, "pending")
          )
        )
        .for("update");

      if (claimableEvents.length === 0) {
        return { error: "No funds available to withdraw", status: 400 } as const;
      }

      const totalAmount = claimableEvents.reduce(
        (sum, e) => sum + e.amountUsdc,
        0
      );

      if (totalAmount <= 0) {
        return { error: "Insufficient balance to withdraw", status: 400 } as const;
      }

      // 2. Rate-limit check inside the transaction so it is consistent with
      //    the lock we just acquired.  Count distinct withdrawnAt values today;
      //    each batch sets an identical withdrawnAt across all its events, so
      //    DISTINCT gives us the number of withdrawal batches.
      const [{ batchesToday }] = await tx
        .select({ batchesToday: countDistinct(revenueEvents.withdrawnAt) })
        .from(revenueEvents)
        .where(
          and(
            eq(revenueEvents.recipientUserId, user.id),
            gte(revenueEvents.withdrawnAt, todayStart)
          )
        );

      if (batchesToday >= DAILY_WITHDRAWAL_LIMIT) {
        return {
          error: `Withdrawal limit reached. You may withdraw at most ${DAILY_WITHDRAWAL_LIMIT} times per day.`,
          status: 429,
        } as const;
      }

      // 3. Mark events as "sent" (in-progress) with the shared withdrawnAt so
      //    subsequent rate-limit checks within the same UTC day see this batch.
      const eventIds = claimableEvents.map((e) => e.id);
      for (const eventId of eventIds) {
        await tx
          .update(revenueEvents)
          .set({ status: "sent", withdrawnAt })
          .where(eq(revenueEvents.id, eventId));
      }

      return { eventIds, totalAmount } as const;
    });

    if ("error" in claimResult) {
      return NextResponse.json(
        { error: claimResult.error },
        { status: claimResult.status }
      );
    }

    const { eventIds, totalAmount } = claimResult;

    // ── Onchain claim phase ───────────────────────────────────────────────────
    // Runs outside the DB transaction so we don't hold row locks while waiting
    // for the receipt.
    let claimed: Awaited<ReturnType<typeof relayClaim>>;
    try {
      claimed = await relayClaim(user.walletAddress);
    } catch (error) {
      // Revert events to pending and clear withdrawnAt so the user can retry
      // and so this failed attempt does not count against their daily limit.
      for (const eventId of eventIds) {
        await db
          .update(revenueEvents)
          .set({ status: "pending", withdrawnAt: null })
          .where(eq(revenueEvents.id, eventId));
      }
      console.error("Withdrawal claim failed", error);
      return NextResponse.json(
        { error: "Failed to claim USDC from the marketplace contract. Please try again." },
        { status: 500 }
      );
    }

    // A null txHash means the balance was already claimed directly from the
    // contract by the user's own wallet.
    for (const eventId of eventIds) {
      await db
        .update(revenueEvents)
        .set({ status: "confirmed", txSignature: claimed.txHash })
        .where(eq(revenueEvents.id, eventId));
    }

    return NextResponse.json({
      ok: true,
      amountUsdc: claimed.txHash ? Number(claimed.amount) : totalAmount,
      txHash: claimed.txHash,
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

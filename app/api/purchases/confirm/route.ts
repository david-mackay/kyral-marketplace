import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  purchases,
  dataListings,
  datasetContributions,
  revenueEvents,
} from "@/server/db/schema";
import { verifyUsdcTransfer } from "@/server/solana/usdc";
import { getPlatformFeeBps } from "@/server/solana/config";

export const runtime = "nodejs";

const ConfirmSchema = z.object({
  purchaseId: z.string().uuid(),
  txSignature: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const body = await req.json();
    const { purchaseId, txSignature } = ConfirmSchema.parse(body);

    // Verify the purchase belongs to this user and is pending
    const purchase = await db.query.purchases.findFirst({
      where: and(
        eq(purchases.id, purchaseId),
        eq(purchases.buyerUserId, user.id),
        eq(purchases.status, "pending")
      ),
    });

    if (!purchase) {
      return NextResponse.json(
        { error: "Purchase not found or already confirmed" },
        { status: 404 }
      );
    }

    // Verify the transaction on-chain (waits for confirmation)
    const verification = await verifyUsdcTransfer({
      txSignature,
      expectedFromWallet: user.walletAddress,
      expectedAmountUsdc: purchase.amountUsdc,
    });

    if (!verification.verified) {
      await db
        .update(purchases)
        .set({ status: "failed", txSignature })
        .where(eq(purchases.id, purchaseId));

      return NextResponse.json(
        { error: "Transaction verification failed" },
        { status: 400 }
      );
    }

    // Mark purchase as confirmed
    await db
      .update(purchases)
      .set({ status: "confirmed", txSignature })
      .where(eq(purchases.id, purchaseId));

    // Record entitlements (no immediate payout — contributors withdraw on their own)
    await recordEntitlements(
      purchase.id,
      purchase.targetType,
      purchase.targetId,
      purchase.amountUsdc
    );

    return NextResponse.json({ ok: true, purchaseId });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }
    console.error("/api/purchases/confirm POST error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Record revenue entitlements for contributors.
 * Revenue events are created with status "pending" (claimable).
 * Contributors withdraw funds themselves via /api/withdrawals.
 */
async function recordEntitlements(
  purchaseId: string,
  targetType: string,
  targetId: string,
  amountUsdc: number
) {
  const platformFeeBps = getPlatformFeeBps();
  const platformFee = Math.floor((amountUsdc * platformFeeBps) / 10000);
  const distributableAmount = amountUsdc - platformFee;

  if (targetType === "listing") {
    const listing = await db.query.dataListings.findFirst({
      where: eq(dataListings.id, targetId),
    });
    if (!listing) return;

    await db.insert(revenueEvents).values({
      purchaseId,
      recipientUserId: listing.ownerUserId,
      amountUsdc: distributableAmount,
      status: "pending",
    });
  } else {
    // Dataset: split equally among active contributors only.
    // Revoked contributors do not earn from new purchases.
    const contributions = await db.query.datasetContributions.findMany({
      where: and(
        eq(datasetContributions.datasetId, targetId),
        eq(datasetContributions.status, "active")
      ),
    });

    if (contributions.length === 0) {
      return;
    }

    const perContributorAmount = Math.floor(
      distributableAmount / contributions.length
    );

    for (const contribution of contributions) {
      await db.insert(revenueEvents).values({
        purchaseId,
        recipientUserId: contribution.contributorUserId,
        amountUsdc: perContributorAmount,
        status: "pending",
      });
    }
  }
}

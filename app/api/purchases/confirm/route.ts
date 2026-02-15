import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  purchases,
  dataListings,
  datasets,
  datasetContributions,
  revenueEvents,
  users,
} from "@/server/db/schema";
import { verifyUsdcTransfer, sendUsdcFromEscrow } from "@/server/solana/usdc";
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

    // Verify the transaction on-chain
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

    // Distribute revenue
    await distributeRevenue(purchase.id, purchase.targetType, purchase.targetId, purchase.amountUsdc);

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
 * Distribute revenue from a purchase to contributors.
 */
async function distributeRevenue(
  purchaseId: string,
  targetType: string,
  targetId: string,
  amountUsdc: number
) {
  const platformFeeBps = getPlatformFeeBps();
  const platformFee = Math.floor((amountUsdc * platformFeeBps) / 10000);
  const distributableAmount = amountUsdc - platformFee;

  if (targetType === "listing") {
    // Single listing: entire amount goes to the owner
    const listing = await db.query.dataListings.findFirst({
      where: eq(dataListings.id, targetId),
    });

    if (!listing) return;

    const owner = await db.query.users.findFirst({
      where: eq(users.id, listing.ownerUserId),
    });

    if (!owner) return;

    // Create revenue event
    const event = await db
      .insert(revenueEvents)
      .values({
        purchaseId,
        recipientUserId: owner.id,
        amountUsdc: distributableAmount,
        status: "pending",
      })
      .returning()
      .then((rows) => rows[0]);

    // Send USDC from escrow
    try {
      const txSig = await sendUsdcFromEscrow({
        recipientWallet: owner.walletAddress,
        amountSmallestUnit: distributableAmount,
      });

      await db
        .update(revenueEvents)
        .set({ status: "confirmed", txSignature: txSig })
        .where(eq(revenueEvents.id, event!.id));
    } catch (error) {
      console.error("Revenue distribution failed for listing", error);
      await db
        .update(revenueEvents)
        .set({ status: "failed" })
        .where(eq(revenueEvents.id, event!.id));
    }
  } else {
    // Dataset: split among contributors
    const contributions = await db.query.datasetContributions.findMany({
      where: eq(datasetContributions.datasetId, targetId),
    });

    if (contributions.length === 0) {
      // No contributions yet -- send to the dataset creator
      const dataset = await db.query.datasets.findFirst({
        where: eq(datasets.id, targetId),
      });
      if (!dataset) return;

      const creator = await db.query.users.findFirst({
        where: eq(users.id, dataset.creatorUserId),
      });
      if (!creator) return;

      const event = await db
        .insert(revenueEvents)
        .values({
          purchaseId,
          recipientUserId: creator.id,
          amountUsdc: distributableAmount,
          status: "pending",
        })
        .returning()
        .then((rows) => rows[0]);

      try {
        const txSig = await sendUsdcFromEscrow({
          recipientWallet: creator.walletAddress,
          amountSmallestUnit: distributableAmount,
        });

        await db
          .update(revenueEvents)
          .set({ status: "confirmed", txSignature: txSig })
          .where(eq(revenueEvents.id, event!.id));
      } catch (error) {
        console.error("Revenue distribution failed for dataset creator", error);
        await db
          .update(revenueEvents)
          .set({ status: "failed" })
          .where(eq(revenueEvents.id, event!.id));
      }
      return;
    }

    // Equal split among all contributors
    const totalContributions = contributions.length;
    const perContributorAmount = Math.floor(
      distributableAmount / totalContributions
    );

    for (const contribution of contributions) {
      const contributor = await db.query.users.findFirst({
        where: eq(users.id, contribution.contributorUserId),
      });

      if (!contributor) continue;

      const event = await db
        .insert(revenueEvents)
        .values({
          purchaseId,
          recipientUserId: contributor.id,
          amountUsdc: perContributorAmount,
          status: "pending",
        })
        .returning()
        .then((rows) => rows[0]);

      try {
        const txSig = await sendUsdcFromEscrow({
          recipientWallet: contributor.walletAddress,
          amountSmallestUnit: perContributorAmount,
        });

        await db
          .update(revenueEvents)
          .set({ status: "confirmed", txSignature: txSig })
          .where(eq(revenueEvents.id, event!.id));
      } catch (error) {
        console.error(
          `Revenue distribution failed for contributor ${contributor.id}`,
          error
        );
        await db
          .update(revenueEvents)
          .set({ status: "failed" })
          .where(eq(revenueEvents.id, event!.id));
      }
    }
  }
}

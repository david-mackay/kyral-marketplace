import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  dataListings,
  datasets,
  datasetContributions,
  purchases,
} from "@/server/db/schema";
import { syncItem } from "@/server/monad/marketplace";
import { MARKETPLACE_ADDRESS, USDC_ADDRESS, purchaseRefFor } from "@/lib/chain";

export const runtime = "nodejs";

const InitiateSchema = z.object({
  targetType: z.enum(["listing", "dataset"]),
  targetId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const body = await req.json();
    const { targetType, targetId } = InitiateSchema.parse(body);

    // Get the price
    let amountUsdc: number;
    if (targetType === "listing") {
      const listing = await db.query.dataListings.findFirst({
        where: eq(dataListings.id, targetId),
      });
      if (!listing) {
        return NextResponse.json(
          { error: "Listing not found" },
          { status: 404 }
        );
      }
      if (listing.ownerUserId === user.id) {
        return NextResponse.json(
          { error: "Cannot purchase your own listing" },
          { status: 400 }
        );
      }
      amountUsdc = listing.priceUsdc;
    } else {
      const dataset = await db.query.datasets.findFirst({
        where: eq(datasets.id, targetId),
      });
      if (!dataset) {
        return NextResponse.json(
          { error: "Dataset not found" },
          { status: 404 }
        );
      }
      const contributions = await db.query.datasetContributions.findMany({
        where: and(
          eq(datasetContributions.datasetId, targetId),
          eq(datasetContributions.status, "active")
        ),
      });
      if (contributions.length === 0) {
        return NextResponse.json(
          { error: "This dataset has no active contributions" },
          { status: 400 }
        );
      }

      amountUsdc = dataset.priceUsdc;
    }

    // The contract is the source of truth for price and payout split, so make
    // sure it reflects the current listing/dataset before the buyer pays.
    const onchain = await syncItem(targetType, targetId);
    if (!onchain.purchasable) {
      return NextResponse.json(
        { error: "This item is not available for purchase" },
        { status: 400 }
      );
    }

    // Create purchase record
    const purchase = await db
      .insert(purchases)
      .values({
        buyerUserId: user.id,
        targetType,
        targetId,
        amountUsdc,
        status: "pending",
      })
      .returning()
      .then((rows) => rows[0]);

    return NextResponse.json({
      purchase,
      amountUsdc,
      itemId: onchain.itemId,
      purchaseRef: purchaseRefFor(purchase.id),
      marketplaceAddress: MARKETPLACE_ADDRESS,
      usdcAddress: USDC_ADDRESS,
    });
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
    console.error("/api/purchases/initiate POST error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

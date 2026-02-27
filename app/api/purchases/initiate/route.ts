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
import { getEscrowKeypair, getUsdcMint } from "@/server/solana/config";

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

    // Return escrow info for the client to build the transfer
    const escrow = getEscrowKeypair();
    const escrowAddress = escrow.publicKey.toBase58();

    return NextResponse.json({
      purchase,
      escrowAddress,
      amountUsdc,
      usdcMint: getUsdcMint(),
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

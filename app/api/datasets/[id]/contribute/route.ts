import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  datasets,
  dataListings,
  datasetContributions,
} from "@/server/db/schema";

export const runtime = "nodejs";

const ContributeSchema = z.object({
  listingId: z.string().uuid(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser();
    const { id: datasetId } = await params;
    const body = await req.json();
    const { listingId } = ContributeSchema.parse(body);

    // Verify dataset exists and is open
    const dataset = await db.query.datasets.findFirst({
      where: eq(datasets.id, datasetId),
    });

    if (!dataset) {
      return NextResponse.json(
        { error: "Dataset not found" },
        { status: 404 }
      );
    }

    if (dataset.status !== "open") {
      return NextResponse.json(
        { error: "Dataset is not accepting contributions" },
        { status: 400 }
      );
    }

    // Verify the listing belongs to the user
    const listing = await db.query.dataListings.findFirst({
      where: and(
        eq(dataListings.id, listingId),
        eq(dataListings.ownerUserId, user.id)
      ),
    });

    if (!listing) {
      return NextResponse.json(
        { error: "Listing not found or not owned by you" },
        { status: 404 }
      );
    }

    // Check for duplicate contribution
    const existing = await db.query.datasetContributions.findFirst({
      where: and(
        eq(datasetContributions.datasetId, datasetId),
        eq(datasetContributions.listingId, listingId)
      ),
    });

    if (existing) {
      return NextResponse.json(
        { error: "This listing is already contributed to this dataset" },
        { status: 409 }
      );
    }

    // Add contribution with equal share (1:1 for now; share recalculated on fetch)
    const contribution = await db
      .insert(datasetContributions)
      .values({
        datasetId,
        contributorUserId: user.id,
        listingId,
        shareNumerator: 1,
        shareDenominator: 1, // Will be total contributions count
      })
      .returning()
      .then((rows) => rows[0]);

    // Increment total contributions
    await db
      .update(datasets)
      .set({
        totalContributions: sql`${datasets.totalContributions} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(datasets.id, datasetId));

    return NextResponse.json({ ok: true, contribution });
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
    console.error("/api/datasets/[id]/contribute POST error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

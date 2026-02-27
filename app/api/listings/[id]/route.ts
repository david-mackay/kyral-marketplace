import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  dataListings,
  datasets,
  users,
  datasetContributions,
  purchases,
} from "@/server/db/schema";

export const runtime = "nodejs";

const UpdateListingSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  category: z
    .enum([
      "vitals",
      "lab_results",
      "demographics",
      "medications",
      "conditions",
      "imaging",
      "genomics",
      "wearable",
      "mixed",
      "other",
    ])
    .optional(),
  priceUsdc: z.number().int().positive().optional(),
  status: z.enum(["draft", "active", "paused"]).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const listing = await db
      .select({
        id: dataListings.id,
        ownerUserId: dataListings.ownerUserId,
        title: dataListings.title,
        description: dataListings.description,
        category: dataListings.category,
        documentIds: dataListings.documentIds,
        priceUsdc: dataListings.priceUsdc,
        status: dataListings.status,
        createdAt: dataListings.createdAt,
        ownerWallet: users.walletAddress,
        ownerName: users.displayName,
      })
      .from(dataListings)
      .leftJoin(users, eq(dataListings.ownerUserId, users.id))
      .where(eq(dataListings.id, id))
      .then((rows) => rows[0]);

    if (!listing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get dataset contributions for this listing
    const contributions = await db.query.datasetContributions.findMany({
      where: eq(datasetContributions.listingId, id),
    });

    return NextResponse.json({ listing, contributions });
  } catch (error) {
    console.error("/api/listings/[id] GET error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser();
    const { id } = await params;
    const body = await req.json();
    const parsed = UpdateListingSchema.parse(body);

    const existing = await db.query.dataListings.findFirst({
      where: and(
        eq(dataListings.id, id),
        eq(dataListings.ownerUserId, user.id)
      ),
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Not found or not owned by you" },
        { status: 404 }
      );
    }

    const updated = await db
      .update(dataListings)
      .set({
        ...parsed,
        updatedAt: new Date(),
      })
      .where(eq(dataListings.id, id))
      .returning()
      .then((rows) => rows[0]);

    return NextResponse.json({ ok: true, listing: updated });
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
    console.error("/api/listings/[id] PATCH error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser();
    const { id } = await params;

    const existing = await db.query.dataListings.findFirst({
      where: and(
        eq(dataListings.id, id),
        eq(dataListings.ownerUserId, user.id)
      ),
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Not found or not owned by you" },
        { status: 404 }
      );
    }

    const confirmedPurchase = await db.query.purchases.findFirst({
      where: and(
        eq(purchases.targetType, "listing"),
        eq(purchases.targetId, id),
        eq(purchases.status, "confirmed")
      ),
    });

    if (confirmedPurchase) {
      return NextResponse.json(
        { error: "Cannot delete a listing that has been purchased" },
        { status: 400 }
      );
    }

    // Decrement totalContributions on any datasets this listing contributed to
    const activeContributions = await db.query.datasetContributions.findMany({
      where: and(
        eq(datasetContributions.listingId, id),
        eq(datasetContributions.status, "active")
      ),
    });

    const affectedDatasetIds = [
      ...new Set(activeContributions.map((c) => c.datasetId)),
    ];
    for (const datasetId of affectedDatasetIds) {
      const count = activeContributions.filter(
        (c) => c.datasetId === datasetId
      ).length;
      await db
        .update(datasets)
        .set({
          totalContributions: sql`GREATEST(${datasets.totalContributions} - ${count}, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(datasets.id, datasetId));
    }

    // Cascade deletes the contribution rows via FK
    await db.delete(dataListings).where(eq(dataListings.id, id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    console.error("/api/listings/[id] DELETE error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

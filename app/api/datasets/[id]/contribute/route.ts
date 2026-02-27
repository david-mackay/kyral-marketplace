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

const RevokeSchema = z.object({
  listingId: z.string().uuid(),
});

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

    // Check for existing contribution (may be revoked — reactivate if so)
    const existing = await db.query.datasetContributions.findFirst({
      where: and(
        eq(datasetContributions.datasetId, datasetId),
        eq(datasetContributions.listingId, listingId)
      ),
    });

    let contribution;

    if (existing && existing.status === "active") {
      return NextResponse.json(
        { error: "This listing is already contributed to this dataset" },
        { status: 409 }
      );
    } else if (existing && existing.status === "revoked") {
      // Reactivate previously revoked contribution
      [contribution] = await db
        .update(datasetContributions)
        .set({ status: "active", revokedAt: null })
        .where(eq(datasetContributions.id, existing.id))
        .returning();
    } else {
      [contribution] = await db
        .insert(datasetContributions)
        .values({
          datasetId,
          contributorUserId: user.id,
          listingId,
          shareNumerator: 1,
          shareDenominator: 1,
        })
        .returning();
    }

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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser();
    const { id: datasetId } = await params;
    const body = await req.json();
    const { listingId } = RevokeSchema.parse(body);

    const contribution = await db.query.datasetContributions.findFirst({
      where: and(
        eq(datasetContributions.datasetId, datasetId),
        eq(datasetContributions.listingId, listingId),
        eq(datasetContributions.contributorUserId, user.id),
        eq(datasetContributions.status, "active")
      ),
    });

    if (!contribution) {
      return NextResponse.json(
        { error: "Active contribution not found" },
        { status: 404 }
      );
    }

    await db
      .update(datasetContributions)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(eq(datasetContributions.id, contribution.id));

    await db
      .update(datasets)
      .set({
        totalContributions: sql`GREATEST(${datasets.totalContributions} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(datasets.id, datasetId));

    return NextResponse.json({ ok: true });
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
    console.error("/api/datasets/[id]/contribute DELETE error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

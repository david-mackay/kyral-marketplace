import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  datasets,
  users,
  datasetContributions,
  dataListings,
  purchases,
} from "@/server/db/schema";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const dataset = await db
      .select({
        id: datasets.id,
        creatorUserId: datasets.creatorUserId,
        title: datasets.title,
        description: datasets.description,
        category: datasets.category,
        priceUsdc: datasets.priceUsdc,
        status: datasets.status,
        totalContributions: datasets.totalContributions,
        createdAt: datasets.createdAt,
        creatorWallet: users.walletAddress,
        creatorName: users.displayName,
      })
      .from(datasets)
      .leftJoin(users, eq(datasets.creatorUserId, users.id))
      .where(eq(datasets.id, id))
      .then((rows) => rows[0]);

    if (!dataset) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get contributions with contributor info
    const contributions = await db
      .select({
        id: datasetContributions.id,
        contributorUserId: datasetContributions.contributorUserId,
        listingId: datasetContributions.listingId,
        shareNumerator: datasetContributions.shareNumerator,
        shareDenominator: datasetContributions.shareDenominator,
        joinedAt: datasetContributions.joinedAt,
        contributorWallet: users.walletAddress,
        contributorName: users.displayName,
        listingTitle: dataListings.title,
      })
      .from(datasetContributions)
      .leftJoin(
        users,
        eq(datasetContributions.contributorUserId, users.id)
      )
      .leftJoin(
        dataListings,
        eq(datasetContributions.listingId, dataListings.id)
      )
      .where(eq(datasetContributions.datasetId, id));

    return NextResponse.json({ dataset, contributions });
  } catch (error) {
    console.error("/api/datasets/[id] GET error", error);
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

    const existing = await db.query.datasets.findFirst({
      where: and(
        eq(datasets.id, id),
        eq(datasets.creatorUserId, user.id)
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
        eq(purchases.targetType, "dataset"),
        eq(purchases.targetId, id),
        eq(purchases.status, "confirmed")
      ),
    });

    if (confirmedPurchase) {
      return NextResponse.json(
        { error: "Cannot delete a dataset that has been purchased" },
        { status: 400 }
      );
    }

    await db.delete(datasets).where(eq(datasets.id, id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    console.error("/api/datasets/[id] DELETE error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

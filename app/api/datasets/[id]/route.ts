import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  datasets,
  users,
  datasetContributions,
  dataListings,
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

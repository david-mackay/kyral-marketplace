import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  purchases,
  dataListings,
  datasetContributions,
  documents,
} from "@/server/db/schema";
import { getPresignedUrl } from "@/server/storage/s3";
import { deliverableFile, zipResponse, type DeliverableFile } from "@/server/delivery";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ purchaseId: string }> }
) {
  try {
    const user = await requireAuthenticatedUser();
    const { purchaseId } = await params;

    const purchase = await db.query.purchases.findFirst({
      where: and(
        eq(purchases.id, purchaseId),
        eq(purchases.buyerUserId, user.id),
        eq(purchases.status, "confirmed")
      ),
    });

    if (!purchase) {
      return NextResponse.json(
        { error: "Purchase not found or not confirmed" },
        { status: 404 }
      );
    }

    let documentIds: string[] = [];

    if (purchase.targetType === "listing") {
      const listing = await db.query.dataListings.findFirst({
        where: eq(dataListings.id, purchase.targetId),
      });
      if (listing) {
        documentIds = (listing.documentIds as string[]) ?? [];
      }
    } else {
      // Dataset: collect documents only from active (non-revoked) contributions
      const contributions = await db.query.datasetContributions.findMany({
        where: and(
          eq(datasetContributions.datasetId, purchase.targetId),
          eq(datasetContributions.status, "active")
        ),
      });

      const listingIds = contributions.map((c) => c.listingId);
      if (listingIds.length > 0) {
        const listings = await db.query.dataListings.findMany({
          where: inArray(dataListings.id, listingIds),
        });
        for (const listing of listings) {
          const ids = (listing.documentIds as string[]) ?? [];
          documentIds.push(...ids);
        }
      }
    }

    if (documentIds.length === 0) {
      if (purchase.targetType === "dataset") {
        return NextResponse.json({ files: [], zip: false });
      }
      return NextResponse.json({ files: [] });
    }

    const docs = await db.query.documents.findMany({
      where: inArray(documents.id, documentIds),
    });

    const deliverables = docs
      .map(deliverableFile)
      .filter((f): f is DeliverableFile => f !== null);

    if (purchase.targetType === "dataset") {
      return zipResponse(deliverables, `dataset-${purchase.targetId.slice(0, 8)}.zip`);
    }

    const files = await Promise.all(
      deliverables.map(async (file) => {
        let downloadUrl: string | null = null;
        try {
          downloadUrl = await getPresignedUrl({ key: file.key, expiresInSeconds: 3600 });
        } catch {
          // URL generation failed
        }
        const doc = docs.find((d) => d.id === file.documentId);
        return {
          id: file.documentId,
          fileName: file.fileName,
          contentType: file.contentType,
          sizeBytes: doc?.sizeBytes ?? 0,
          downloadUrl,
        };
      })
    );

    return NextResponse.json({ files });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    console.error("/api/data-access/[purchaseId] GET error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

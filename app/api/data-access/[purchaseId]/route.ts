import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  purchases,
  dataListings,
  datasets,
  datasetContributions,
  documents,
} from "@/server/db/schema";
import { getPresignedUrl } from "@/server/storage/s3";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ purchaseId: string }> }
) {
  try {
    const user = await requireAuthenticatedUser();
    const { purchaseId } = await params;

    // Verify the purchase belongs to this user and is confirmed
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

    // Get the document IDs based on target type
    let documentIds: string[] = [];

    if (purchase.targetType === "listing") {
      const listing = await db.query.dataListings.findFirst({
        where: eq(dataListings.id, purchase.targetId),
      });
      if (listing) {
        documentIds = (listing.documentIds as string[]) ?? [];
      }
    } else {
      // Dataset: collect all document IDs from all contributions
      const contributions = await db.query.datasetContributions.findMany({
        where: eq(datasetContributions.datasetId, purchase.targetId),
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
      return NextResponse.json({ files: [] });
    }

    // Get document metadata and generate presigned URLs
    const docs = await db.query.documents.findMany({
      where: inArray(documents.id, documentIds),
    });

    const files = await Promise.all(
      docs.map(async (doc) => {
        let downloadUrl: string | null = null;
        if (doc.objectKey) {
          try {
            downloadUrl = await getPresignedUrl({
              key: doc.objectKey,
              expiresInSeconds: 3600, // 1 hour
            });
          } catch {
            // URL generation failed
          }
        }

        return {
          id: doc.id,
          fileName: doc.originalFileName,
          contentType: doc.contentType,
          sizeBytes: doc.sizeBytes,
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

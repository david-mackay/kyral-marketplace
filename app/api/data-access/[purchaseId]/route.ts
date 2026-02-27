import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import archiver from "archiver";
import { PassThrough } from "node:stream";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  purchases,
  dataListings,
  datasetContributions,
  documents,
} from "@/server/db/schema";
import { getPresignedUrl, getObjectBuffer } from "@/server/storage/s3";

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

    // For datasets: stream a ZIP archive at runtime
    if (purchase.targetType === "dataset") {
      const passthrough = new PassThrough();
      const archive = archiver("zip", { zlib: { level: 5 } });
      archive.pipe(passthrough);

      const usedNames = new Set<string>();

      for (const doc of docs) {
        if (!doc.objectKey) continue;
        try {
          const buffer = await getObjectBuffer({ key: doc.objectKey });
          let name = doc.originalFileName ?? doc.id;
          // Deduplicate file names within the ZIP
          if (usedNames.has(name)) {
            const ext = name.lastIndexOf(".");
            const base = ext > 0 ? name.slice(0, ext) : name;
            const suffix = ext > 0 ? name.slice(ext) : "";
            let i = 2;
            while (usedNames.has(`${base}_${i}${suffix}`)) i++;
            name = `${base}_${i}${suffix}`;
          }
          usedNames.add(name);
          archive.append(buffer, { name });
        } catch {
          // Skip files that fail to fetch
        }
      }

      void archive.finalize();

      const readableStream = new ReadableStream({
        start(controller) {
          passthrough.on("data", (chunk: Buffer) => {
            controller.enqueue(new Uint8Array(chunk));
          });
          passthrough.on("end", () => {
            controller.close();
          });
          passthrough.on("error", (err) => {
            controller.error(err);
          });
        },
      });

      return new Response(readableStream, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="dataset-${purchase.targetId.slice(0, 8)}.zip"`,
        },
      });
    }

    // For individual listings: return presigned URLs as before
    const files = await Promise.all(
      docs.map(async (doc) => {
        let downloadUrl: string | null = null;
        if (doc.objectKey) {
          try {
            downloadUrl = await getPresignedUrl({
              key: doc.objectKey,
              expiresInSeconds: 3600,
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

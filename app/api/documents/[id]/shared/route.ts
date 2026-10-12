import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { bountyFills, dataListings, documents, purchases } from "@/server/db/schema";
import { deliverableFile } from "@/server/delivery";
import { parseCsv } from "@/server/intake/tabular";
import { getObjectBuffer } from "@/server/storage/s3";

export const runtime = "nodejs";

const PREVIEW_ROWS = 200;

function isTabular(fileName: string, contentType: string) {
  return /\.(csv|tsv)$/i.test(fileName) || contentType === "text/csv";
}

function preview(body: Buffer, fileName: string) {
  const rows = parseCsv(body.toString("utf8"), fileName.toLowerCase().endsWith(".tsv") ? "\t" : ",");
  const [header = [], ...data] = rows;
  return { header, rows: data.slice(0, PREVIEW_ROWS), totalRows: data.length };
}

/**
 * Exactly what a researcher or buyer receives for one of the owner's files,
 * alongside the original for comparison and everyone it has gone to.
 * `?download=1` returns the shared file itself.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthenticatedUser();
    const { id } = await params;

    const doc = await db.query.documents.findFirst({
      where: and(eq(documents.id, id), eq(documents.ownerUserId, user.id)),
    });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const shared = deliverableFile(doc);

    if (req.nextUrl.searchParams.get("download") === "1") {
      if (!shared) return NextResponse.json({ error: "This file is never shared" }, { status: 404 });
      const body = await getObjectBuffer({ key: shared.key });
      return new Response(new Uint8Array(body), {
        headers: {
          "Content-Type": shared.contentType,
          "Content-Disposition": `attachment; filename="${shared.fileName.replace(/"/g, "")}"`,
        },
      });
    }

    const [sharedBody, originalBody, fills, listings] = await Promise.all([
      shared ? getObjectBuffer({ key: shared.key }) : null,
      doc.objectKey && isTabular(doc.originalFileName, doc.contentType) ? getObjectBuffer({ key: doc.objectKey }) : null,
      db.query.bountyFills.findMany({
        where: eq(bountyFills.documentId, doc.id),
        with: { bounty: true },
        orderBy: [desc(bountyFills.createdAt)],
      }),
      db.query.dataListings.findMany({
        where: and(eq(dataListings.ownerUserId, user.id), sql`${dataListings.documentIds} @> ${JSON.stringify([doc.id])}::jsonb`),
      }),
    ]);

    const sales = listings.length
      ? await db.query.purchases.findMany({
          where: and(
            eq(purchases.targetType, "listing"),
            inArray(purchases.targetId, listings.map((l) => l.id)),
            eq(purchases.status, "confirmed")
          ),
          orderBy: [desc(purchases.createdAt)],
        })
      : [];

    return NextResponse.json({
      id: doc.id,
      originalFileName: doc.originalFileName,
      documentType: doc.profile?.documentType ?? null,
      removedIdentifiers: doc.profile?.removedIdentifiers ?? [],
      shared: shared
        ? {
            fileName: shared.fileName,
            sha256: doc.deidSha256,
            deidentified: shared.key === doc.deidObjectKey,
            ...(sharedBody && isTabular(shared.fileName, shared.contentType) ? preview(sharedBody, shared.fileName) : {}),
          }
        : null,
      original: originalBody ? preview(originalBody, doc.originalFileName) : null,
      recipients: [
        ...fills.map((f) => ({
          kind: "study" as const,
          title: f.bounty.title,
          organization: f.bounty.organization,
          purpose: f.bounty.purpose,
          txHash: f.txHash,
          createdAt: f.createdAt,
        })),
        ...sales.map((p) => ({
          kind: "purchase" as const,
          title: "Bought from the marketplace",
          organization: null,
          purpose: null,
          txHash: p.txSignature,
          createdAt: p.createdAt,
        })),
      ],
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    console.error("/api/documents/[id]/shared GET error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

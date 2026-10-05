import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { documents } from "@/server/db/schema";
import { getBucketName, putObject } from "@/server/storage/s3";
import { sha256Hex } from "@/server/monad/provenance";
import { processUpload } from "@/server/intake/process";

export const runtime = "nodejs";
export const maxDuration = 120;

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-()+\s]/g, "_").slice(0, 120);
}

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();

    const docs = await db.query.documents.findMany({
      where: eq(documents.ownerUserId, user.id),
      orderBy: (d, { desc }) => [desc(d.createdAt)],
    });

    return NextResponse.json({ documents: docs });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    console.error("/api/documents GET error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const contentType = file.type || "application/octet-stream";
    const originalFileName = sanitizeFileName(file.name || "document");
    const sizeBytes = file.size;

    const buffer = Buffer.from(await file.arrayBuffer());
    const bucket = getBucketName();
    const objectKey = `${user.id}/${crypto.randomUUID()}-${originalFileName}`;

    const created = await db
      .insert(documents)
      .values({
        ownerUserId: user.id,
        originalFileName,
        contentType,
        sizeBytes,
        bucket,
        objectKey,
        sha256: sha256Hex(buffer),
        status: "uploaded",
      })
      .returning()
      .then((rows) => rows[0]);

    if (!created) {
      return NextResponse.json(
        { error: "DOCUMENT_CREATE_FAILED" },
        { status: 500 }
      );
    }

    try {
      await putObject({ key: objectKey, body: buffer, contentType });
    } catch (uploadError) {
      await db
        .update(documents)
        .set({ status: "error" })
        .where(eq(documents.id, created.id));
      throw uploadError;
    }

    // Analysis failures leave the raw upload private rather than failing it.
    try {
      const result = await processUpload(user.id, created, buffer);
      return NextResponse.json({ ok: true, ...result });
    } catch (analysisError) {
      console.error("Intake failed", analysisError);
      await db
        .update(documents)
        .set({ status: "error" })
        .where(eq(documents.id, created.id));
      return NextResponse.json({
        ok: true,
        document: { ...created, status: "error" },
        listing: null,
        requestsFilled: 0,
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "DATABASE_NOT_AVAILABLE") {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }
    console.error("/api/documents/upload POST error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

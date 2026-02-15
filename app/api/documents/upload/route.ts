import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { documents } from "@/server/db/schema";
import { getBucketName, putObject } from "@/server/storage/s3";

export const runtime = "nodejs";

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

    return NextResponse.json({ ok: true, document: created });
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

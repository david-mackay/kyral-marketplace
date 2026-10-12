import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { bounties, bountyFills } from "@/server/db/schema";
import { rentalEnded } from "@/lib/bounties";
import { deliverableFile, zipResponse, type DeliverableFile } from "@/server/delivery";

export const runtime = "nodejs";

/** The researcher's delivery: every contributed file, de-identified. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthenticatedUser();
    const { id } = await params;

    const bounty = await db.query.bounties.findFirst({
      where: and(eq(bounties.id, id), eq(bounties.creatorUserId, user.id)),
    });
    if (!bounty) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (rentalEnded(bounty)) {
      return NextResponse.json({ error: "This rental has ended, so its data is no longer available." }, { status: 403 });
    }

    const fills = await db.query.bountyFills.findMany({
      where: eq(bountyFills.bountyId, id),
      with: { document: true },
    });
    const files = fills
      .map((f, i) => {
        const file = deliverableFile(f.document);
        return file ? { ...file, fileName: `contributor_${i + 1}_${file.fileName}` } : null;
      })
      .filter((f): f is DeliverableFile => f !== null);

    return zipResponse(files, `kyral-request-${id.slice(0, 8)}.zip`);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    console.error("/api/bounties/[id]/download GET error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

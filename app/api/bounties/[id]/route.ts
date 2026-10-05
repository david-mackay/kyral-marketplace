import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { getAuthenticatedUserWithDb } from "@/server/auth/session";
import { db } from "@/server/db";
import { bounties, bountyFills } from "@/server/db/schema";

export const runtime = "nodejs";

/**
 * Public request detail. The creator also sees a de-identified summary of
 * each contribution (never who contributed).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bounty = await db.query.bounties.findFirst({ where: eq(bounties.id, id) });
    if (!bounty) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const viewer = await getAuthenticatedUserWithDb();
    const isCreator = viewer?.id === bounty.creatorUserId;

    let contributions: unknown[] = [];
    let myFill: { rewardUsdc: number; txHash: string | null; createdAt: Date } | null = null;

    if (isCreator) {
      const fills = await db.query.bountyFills.findMany({
        where: eq(bountyFills.bountyId, id),
        with: { document: true },
        orderBy: [desc(bountyFills.createdAt)],
      });
      contributions = fills.map((f, i) => ({
        label: `Contributor ${fills.length - i}`,
        documentType: f.document.profile?.documentType ?? "Health data",
        rowCount: f.document.profile?.rowCount ?? 0,
        spanDays: f.document.profile?.spanDays ?? 0,
        dataHash: f.document.deidSha256,
        txHash: f.txHash,
        createdAt: f.createdAt,
      }));
    } else if (viewer) {
      const fill = await db.query.bountyFills.findFirst({
        where: (f, { and }) => and(eq(f.bountyId, id), eq(f.contributorUserId, viewer.id)),
      });
      if (fill) myFill = { rewardUsdc: fill.rewardUsdc, txHash: fill.txHash, createdAt: fill.createdAt };
    }

    return NextResponse.json({ bounty, isCreator, contributions, myFill });
  } catch (error) {
    console.error("/api/bounties/[id] GET error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

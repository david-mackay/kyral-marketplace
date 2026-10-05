import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { CONSENT_PURPOSES } from "@/lib/data-profile";
import { bountyIdFor, MARKETPLACE_ADDRESS, USDC_ADDRESS } from "@/lib/chain";
import { DATA_CATEGORIES } from "@/lib/format";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { bounties } from "@/server/db/schema";
import { quoteBountyDeposit } from "@/server/monad/bounties";

export const runtime = "nodejs";

const CreateBountySchema = z.object({
  title: z.string().min(3).max(140),
  description: z.string().max(3000).optional(),
  organization: z.string().max(120).optional(),
  purpose: z.enum(CONSENT_PURPOSES),
  criteria: z.object({
    categories: z.array(z.string().refine((c) => DATA_CATEGORIES.includes(c))).max(10),
    requiredSignals: z.array(z.string().min(1).max(40)).max(10),
    minRows: z.number().int().min(0).max(100_000),
    minSpanDays: z.number().int().min(0).max(3650),
  }),
  rewardUsdc: z.number().int().min(100_000).max(10_000_000_000), // $0.10 – $10k
  maxContributors: z.number().int().min(1).max(10_000),
});

/** Public: open and recently filled requests. `?mine=true` for the creator's own. */
export async function GET(req: NextRequest) {
  try {
    const mine = new URL(req.url).searchParams.get("mine") === "true";
    const rows = mine
      ? await db.query.bounties.findMany({
          where: eq(bounties.creatorUserId, (await requireAuthenticatedUser()).id),
          orderBy: [desc(bounties.createdAt)],
        })
      : await db.query.bounties.findMany({
          where: inArray(bounties.status, ["open", "filled"]),
          orderBy: [desc(bounties.createdAt)],
          limit: 100,
        });
    return NextResponse.json({ bounties: rows });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    console.error("/api/bounties GET error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Create a request and return the escrow quote the researcher must fund. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const parsed = CreateBountySchema.parse(await req.json());

    const [bounty] = await db
      .insert(bounties)
      .values({ ...parsed, creatorUserId: user.id, status: "awaiting_funding" })
      .returning();
    if (!bounty) throw new Error("Failed to create bounty");

    const { total, feePerFill } = await quoteBountyDeposit(bounty.rewardUsdc, bounty.maxContributors);

    return NextResponse.json({
      bounty,
      funding: {
        bountyId: bountyIdFor(bounty.id),
        rewardUsdc: bounty.rewardUsdc,
        maxContributors: bounty.maxContributors,
        depositUsdc: total.toString(),
        feePerFillUsdc: feePerFill.toString(),
        marketplaceAddress: MARKETPLACE_ADDRESS,
        usdcAddress: USDC_ADDRESS,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.errors }, { status: 400 });
    }
    console.error("/api/bounties POST error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { purchases, dataListings, datasets } from "@/server/db/schema";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();

    const userPurchases = await db.query.purchases.findMany({
      where: and(
        eq(purchases.buyerUserId, user.id),
        eq(purchases.status, "confirmed")
      ),
      orderBy: [desc(purchases.createdAt)],
    });

    // Enrich with title from listing or dataset
    const enriched = await Promise.all(
      userPurchases.map(async (p) => {
        let title = "Unknown";
        if (p.targetType === "listing") {
          const listing = await db.query.dataListings.findFirst({
            where: eq(dataListings.id, p.targetId),
          });
          title = listing?.title ?? title;
        } else {
          const dataset = await db.query.datasets.findFirst({
            where: eq(datasets.id, p.targetId),
          });
          title = dataset?.title ?? title;
        }
        return { ...p, title };
      })
    );

    return NextResponse.json({ purchases: enriched });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    console.error("/api/purchases GET error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

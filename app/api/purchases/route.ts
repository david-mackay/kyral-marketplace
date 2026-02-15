import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { purchases } from "@/server/db/schema";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();

    const userPurchases = await db.query.purchases.findMany({
      where: eq(purchases.buyerUserId, user.id),
      orderBy: [desc(purchases.createdAt)],
    });

    return NextResponse.json({ purchases: userPurchases });
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

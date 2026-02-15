import { NextRequest, NextResponse } from "next/server";
import { eq, and, ilike, desc } from "drizzle-orm";
import { z } from "zod";

import { requireAuthenticatedUser, getAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { dataListings, users } from "@/server/db/schema";

export const runtime = "nodejs";

const CreateListingSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.enum([
    "vitals",
    "lab_results",
    "demographics",
    "medications",
    "conditions",
    "imaging",
    "genomics",
    "wearable",
    "mixed",
    "other",
  ]),
  documentIds: z.array(z.string().uuid()),
  priceUsdc: z.number().int().positive(), // smallest unit
  status: z.enum(["draft", "active"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const category = url.searchParams.get("category");
    const search = url.searchParams.get("search");
    const ownerOnly = url.searchParams.get("mine") === "true";

    let user = null;
    if (ownerOnly) {
      user = await requireAuthenticatedUser();
    }

    const conditions = [eq(dataListings.status, "active")];

    if (ownerOnly && user) {
      // Show all statuses for owner
      conditions.length = 0;
      conditions.push(eq(dataListings.ownerUserId, user.id));
    }

    if (category && category !== "all") {
      conditions.push(
        eq(
          dataListings.category,
          category as typeof dataListings.category.enumValues[number]
        )
      );
    }

    if (search) {
      conditions.push(ilike(dataListings.title, `%${search}%`));
    }

    const listings = await db
      .select({
        id: dataListings.id,
        ownerUserId: dataListings.ownerUserId,
        title: dataListings.title,
        description: dataListings.description,
        category: dataListings.category,
        documentIds: dataListings.documentIds,
        priceUsdc: dataListings.priceUsdc,
        status: dataListings.status,
        createdAt: dataListings.createdAt,
        ownerWallet: users.walletAddress,
        ownerName: users.displayName,
      })
      .from(dataListings)
      .leftJoin(users, eq(dataListings.ownerUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(dataListings.createdAt))
      .limit(50);

    return NextResponse.json({ listings });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    console.error("/api/listings GET error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const body = await req.json();
    const parsed = CreateListingSchema.parse(body);

    const listing = await db
      .insert(dataListings)
      .values({
        ownerUserId: user.id,
        title: parsed.title,
        description: parsed.description ?? null,
        category: parsed.category,
        documentIds: parsed.documentIds,
        priceUsdc: parsed.priceUsdc,
        status: parsed.status ?? "draft",
      })
      .returning()
      .then((rows) => rows[0]);

    return NextResponse.json({ ok: true, listing });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }
    console.error("/api/listings POST error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

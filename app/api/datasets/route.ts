import { NextRequest, NextResponse } from "next/server";
import { eq, and, ilike, desc } from "drizzle-orm";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { datasets, users } from "@/server/db/schema";

export const runtime = "nodejs";

const CreateDatasetSchema = z.object({
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
  priceUsdc: z.number().int().positive(),
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

    const conditions = [];

    if (ownerOnly && user) {
      conditions.push(eq(datasets.creatorUserId, user.id));
    } else {
      // Public view: show open and closed (not archived)
      conditions.push(
        eq(datasets.status, "open")
      );
    }

    if (category && category !== "all") {
      conditions.push(
        eq(
          datasets.category,
          category as typeof datasets.category.enumValues[number]
        )
      );
    }

    if (search) {
      conditions.push(ilike(datasets.title, `%${search}%`));
    }

    const result = await db
      .select({
        id: datasets.id,
        creatorUserId: datasets.creatorUserId,
        title: datasets.title,
        description: datasets.description,
        category: datasets.category,
        priceUsdc: datasets.priceUsdc,
        status: datasets.status,
        totalContributions: datasets.totalContributions,
        createdAt: datasets.createdAt,
        creatorWallet: users.walletAddress,
        creatorName: users.displayName,
      })
      .from(datasets)
      .leftJoin(users, eq(datasets.creatorUserId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(datasets.createdAt))
      .limit(50);

    return NextResponse.json({ datasets: result });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    console.error("/api/datasets GET error", error);
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
    const parsed = CreateDatasetSchema.parse(body);

    const dataset = await db
      .insert(datasets)
      .values({
        creatorUserId: user.id,
        title: parsed.title,
        description: parsed.description ?? null,
        category: parsed.category,
        priceUsdc: parsed.priceUsdc,
        status: "open",
      })
      .returning()
      .then((rows) => rows[0]);

    return NextResponse.json({ ok: true, dataset });
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
    console.error("/api/datasets POST error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { CONSENT_PURPOSES } from "@/lib/data-profile";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { fillRequestsForUser } from "@/server/matching";

export const runtime = "nodejs";
export const maxDuration = 120;

const UpdateSchema = z.object({
  displayName: z.string().max(60).nullable().optional(),
  consentPurposes: z.array(z.enum(CONSENT_PURPOSES)).optional(),
  autoFill: z.boolean().optional(),
});

function serialize(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    displayName: u.displayName,
    consentPurposes: u.consentPurposes,
    autoFill: u.autoFill,
  };
}

export async function GET() {
  try {
    const { id } = await requireAuthenticatedUser();
    const user = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ user: serialize(user) });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Update consent. Widening it immediately offers existing data to matching requests. */
export async function PATCH(req: NextRequest) {
  try {
    const { id } = await requireAuthenticatedUser();
    const patch = UpdateSchema.parse(await req.json());
    const [user] = await db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const requestsFilled = user.autoFill ? await fillRequestsForUser(id) : 0;
    return NextResponse.json({ user: serialize(user), requestsFilled });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.errors }, { status: 400 });
    }
    console.error("/api/me PATCH error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

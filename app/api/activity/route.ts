import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { activityEvents } from "@/server/db/schema";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const unreadOnly = new URL(req.url).searchParams.get("unread") === "true";
    const events = await db.query.activityEvents.findMany({
      where: unreadOnly
        ? and(eq(activityEvents.userId, user.id), isNull(activityEvents.readAt))
        : eq(activityEvents.userId, user.id),
      orderBy: [desc(activityEvents.createdAt)],
      limit: 50,
    });
    return NextResponse.json({ events });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    console.error("/api/activity GET error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Mark everything read (called once toasts have been shown). */
export async function POST() {
  try {
    const user = await requireAuthenticatedUser();
    await db
      .update(activityEvents)
      .set({ readAt: new Date() })
      .where(and(eq(activityEvents.userId, user.id), isNull(activityEvents.readAt)));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    console.error("/api/activity POST error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/server/db";
import { waitlistSignups } from "@/server/db/schema";

export const runtime = "nodejs";

const WaitlistSignupSchema = z.object({
  email: z.string().trim().email().max(320),
  persona: z
    .enum(["Data owner", "Researcher", "Investor", "Strategic partner"])
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = WaitlistSignupSchema.parse(await req.json());
    const email = parsed.email.toLowerCase();
    const now = new Date();

    await db
      .insert(waitlistSignups)
      .values({
        email,
        persona: parsed.persona ?? null,
        source: "landing_page",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: waitlistSignups.email,
        set: {
          persona: parsed.persona ?? null,
          source: "landing_page",
          updatedAt: now,
        },
      });

    return NextResponse.json({
      ok: true,
      message: "You're on the waitlist. We'll be in touch.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    console.error("/api/waitlist POST error", error);
    return NextResponse.json(
      { error: "We could not join the waitlist right now." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { generateDatasetPlan } from "@/server/bioagents/openrouter";

export const runtime = "nodejs";

const PlanRequestSchema = z.object({
  topic: z.string().min(5, "Topic must be at least 5 characters").max(500),
});

export async function POST(req: NextRequest) {
  try {
    await requireAuthenticatedUser();
    const body = await req.json();
    const { topic } = PlanRequestSchema.parse(body);

    const plan = await generateDatasetPlan(topic);

    return NextResponse.json({ ok: true, plan });
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
    console.error("/api/bios/plan-dataset POST error", error);
    return NextResponse.json(
      { error: "Failed to generate dataset plan. Please try again." },
      { status: 500 }
    );
  }
}

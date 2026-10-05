import { db } from "@/server/db";
import { activityEvents } from "@/server/db/schema";

type NewActivity = typeof activityEvents.$inferInsert;

/** Activity never blocks the action that produced it. */
export async function recordActivity(...events: NewActivity[]) {
  if (events.length === 0) return;
  try {
    await db.insert(activityEvents).values(events);
  } catch (error) {
    console.error("Failed to record activity", error);
  }
}

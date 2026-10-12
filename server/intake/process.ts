import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";

import { formatUsdc } from "@/lib/format";
import { recordActivity } from "@/server/activity";
import { db } from "@/server/db";
import { dataListings, documents, users, type Document, type User } from "@/server/db/schema";
import { syncItemSafe } from "@/server/monad/marketplace";
import { sha256Hex } from "@/server/monad/provenance";
import { fillRequestsForUser } from "@/server/matching";
import { putObject } from "@/server/storage/s3";
import { analyzeUpload } from "./analyze";

async function dateShiftFor(user: User): Promise<number> {
  if (user.dateShiftDays !== null) return user.dateShiftDays;
  // Non-zero offset within ±6 months, fixed per person so their files stay aligned.
  const shift = randomInt(1, 181) * (randomInt(0, 2) === 0 ? -1 : 1);
  await db.update(users).set({ dateShiftDays: shift }).where(eq(users.id, user.id));
  return shift;
}

/**
 * The "we handle it" pipeline: understand the file, strip identifiers, price
 * it, list it, and offer it to every matching research request.
 */
export async function processUpload(userId: string, doc: Document, body: Buffer) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new Error("User not found");

  const { profile, deidentified } = await analyzeUpload({
    body,
    fileName: doc.originalFileName,
    contentType: doc.contentType,
    dateShiftDays: await dateShiftFor(user),
  });

  let deidFields = {};
  if (deidentified) {
    const key = `${userId}/deidentified/${doc.id}-${deidentified.fileName}`;
    await putObject({ key, body: deidentified.body, contentType: deidentified.contentType });
    deidFields = {
      deidObjectKey: key,
      deidSha256: sha256Hex(deidentified.body),
      deidContentType: deidentified.contentType,
      deidFileName: deidentified.fileName,
    };
  }

  const [updated] = await db
    .update(documents)
    .set({ profile, status: "parsed", ...deidFields })
    .where(eq(documents.id, doc.id))
    .returning();

  const span = profile.spanDays > 1 ? ` · ${profile.spanDays} days` : "";
  await recordActivity({
    userId,
    kind: "data_ready",
    title: deidentified
      ? `${profile.documentType} is ready to earn`
      : `${profile.documentType} stored privately`,
    detail: deidentified
      ? `${profile.rowCount} records${span}${profile.removedIdentifiers.length ? ` · removed ${profile.removedIdentifiers.join(", ")}` : " · no identifiers found"}`
      : profile.summary,
    href: "/earn",
  });

  if (!deidentified || !user.autoFill) {
    return { document: updated, listing: null, requestsFilled: 0, payouts: [] };
  }

  const [listing] = await db
    .insert(dataListings)
    .values({
      ownerUserId: userId,
      title: profile.title,
      description: profile.summary,
      category: profile.category as typeof dataListings.$inferInsert.category,
      documentIds: [doc.id],
      priceUsdc: profile.estimatedValueUsdc,
      status: "active",
    })
    .returning();

  if (listing) {
    await syncItemSafe("listing", listing.id);
    await recordActivity({
      userId,
      kind: "listed",
      title: `Listed for ${formatUsdc(listing.priceUsdc)}`,
      detail: `Priced from ${profile.rowCount} records${span}. You can change this anytime.`,
      href: `/marketplace/${listing.id}?type=listing`,
    });
  }

  const payouts = await fillRequestsForUser(userId);
  return { document: updated, listing, requestsFilled: payouts.length, payouts };
}

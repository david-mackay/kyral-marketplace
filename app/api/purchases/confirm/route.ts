import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { getAddress, type Hex } from "viem";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { dataListings, datasets, purchases, revenueEvents, users } from "@/server/db/schema";
import { recordActivity } from "@/server/activity";
import { verifyPurchase, type VerifiedPurchase } from "@/server/monad/marketplace";

export const runtime = "nodejs";

const ConfirmSchema = z.object({
  purchaseId: z.string().uuid(),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const body = await req.json();
    const { purchaseId, txHash } = ConfirmSchema.parse(body);

    // Verify the purchase belongs to this user and is pending
    const purchase = await db.query.purchases.findFirst({
      where: and(
        eq(purchases.id, purchaseId),
        eq(purchases.buyerUserId, user.id),
        eq(purchases.status, "pending")
      ),
    });

    if (!purchase) {
      return NextResponse.json(
        { error: "Purchase not found or already confirmed" },
        { status: 404 }
      );
    }

    // Waits for the receipt, then checks the Purchased event matches this
    // order, item, and buyer.
    const verification = await verifyPurchase({
      txHash: txHash as Hex,
      purchaseId: purchase.id,
      type: purchase.targetType,
      targetId: purchase.targetId,
      buyer: user.walletAddress,
    });

    if (!verification) {
      await db
        .update(purchases)
        .set({ status: "failed", txSignature: txHash })
        .where(and(eq(purchases.id, purchaseId), eq(purchases.status, "pending")));

      return NextResponse.json(
        { error: "Transaction verification failed" },
        { status: 400 }
      );
    }

    // Conditional update so concurrent confirms can't both record revenue.
    const [confirmed] = await db
      .update(purchases)
      .set({
        status: "confirmed",
        txSignature: txHash,
        amountUsdc: Number(verification.price),
      })
      .where(and(eq(purchases.id, purchaseId), eq(purchases.status, "pending")))
      .returning();

    if (confirmed) {
      await recordEntitlements(purchase, verification, txHash);
    }

    return NextResponse.json({ ok: true, purchaseId, txHash });
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
    console.error("/api/purchases/confirm POST error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Mirror the onchain revenue split into revenue_events for earnings history.
 * Balances themselves live in the contract; contributors claim from there.
 */
async function recordEntitlements(
  purchase: typeof purchases.$inferSelect,
  verification: VerifiedPurchase,
  txHash: string
) {
  const purchaseId = purchase.id;
  if (verification.credits.length === 0) return;

  const wallets = [...new Set(verification.credits.map((c) => getAddress(c.recipient)))];
  const recipients = await db.query.users.findMany({
    where: inArray(users.walletAddress, wallets),
    columns: { id: true, walletAddress: true },
  });
  const userIdByWallet = new Map(recipients.map((u) => [u.walletAddress, u.id]));

  const rows = verification.credits.flatMap((credit) => {
    const recipientUserId = userIdByWallet.get(getAddress(credit.recipient));
    return recipientUserId
      ? [{ purchaseId, recipientUserId, amountUsdc: Number(credit.amount), status: "pending" as const }]
      : [];
  });

  if (rows.length === 0) return;
  await db.insert(revenueEvents).values(rows);

  const target =
    purchase.targetType === "listing"
      ? await db.query.dataListings.findFirst({ where: eq(dataListings.id, purchase.targetId) })
      : await db.query.datasets.findFirst({ where: eq(datasets.id, purchase.targetId) });
  const title = target?.title ?? "your data";

  await recordActivity(
    ...rows.map((row) => ({
      userId: row.recipientUserId,
      kind: "sale" as const,
      title: `A researcher bought ${purchase.targetType === "dataset" ? "a dataset you're part of" : `"${title}"`}`,
      detail: purchase.targetType === "dataset" ? title : "Paid instantly to your balance",
      amountUsdc: row.amountUsdc,
      href: `/marketplace/${purchase.targetId}?type=${purchase.targetType}`,
      txHash,
    }))
  );
}

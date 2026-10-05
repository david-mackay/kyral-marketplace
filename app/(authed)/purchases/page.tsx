"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Money, SkeletonRows, VerifyLink } from "@/components/ui";
import { formatDate } from "@/lib/format";

type Purchase = {
  id: string;
  targetType: string;
  title: string;
  amountUsdc: number;
  txSignature: string | null;
  status: string;
  createdAt: string;
};

export default function LibraryPage() {
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);

  useEffect(() => {
    void fetch("/api/purchases", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPurchases(d.purchases ?? []))
      .catch(() => setPurchases([]));
  }, []);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">Library</h1>
        <p className="mt-3 text-zinc-400">
          Data you&apos;ve bought. Data delivered to your requests lives on each{" "}
          <Link href="/requests" className="text-emerald-300 hover:underline">request</Link>.
        </p>
      </div>

      {purchases === null ? (
        <SkeletonRows rows={4} />
      ) : purchases.length === 0 ? (
        <div className="glass px-8 py-16 text-center">
          <p className="text-sm text-zinc-500 mb-5">Nothing here yet.</p>
          <Link href="/marketplace" className="btn-liquid">Browse the marketplace</Link>
        </div>
      ) : (
        <ul className="glass divide-hairline px-6 sm:px-8">
          {purchases.map((p) => (
            <li key={p.id} className="flex items-center gap-4 py-5">
              <Link href={`/purchases/${p.id}`} className="group min-w-0 flex-1">
                <div className="text-[15px] text-zinc-100 group-hover:text-white truncate">{p.title}</div>
                <div className="text-xs text-zinc-500 mt-1">
                  {p.targetType === "dataset" ? "Pooled dataset" : "Individual"} · {formatDate(p.createdAt)}
                  {p.status !== "confirmed" && <span className="text-amber-300"> · {p.status}</span>}
                </div>
              </Link>
              <VerifyLink txHash={p.txSignature} />
              <Money usdc={p.amountUsdc} className="text-zinc-300 tabular-nums" />
              <Link href={`/purchases/${p.id}`} className="text-zinc-500 hover:text-zinc-200">→</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

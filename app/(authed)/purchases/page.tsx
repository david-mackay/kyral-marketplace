"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoadingDots } from "@/components/LoadingDots";
import { formatUsdc, formatDate } from "@/lib/format";

type Purchase = {
  id: string;
  targetType: string;
  targetId: string;
  title: string;
  amountUsdc: number;
  txSignature: string | null;
  status: string;
  createdAt: string;
};

export default function PurchasesPage() {
  const router = useRouter();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPurchases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/purchases", { cache: "no-store" });
      const data = await res.json();
      setPurchases(data.purchases ?? []);
    } catch (error) {
      console.error("Failed to load purchases", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPurchases();
  }, [loadPurchases]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-zinc-400 text-sm flex items-center gap-2">
          Loading <LoadingDots />
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">My Purchases</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Access your purchased datasets and listings.
        </p>
      </div>

      {purchases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 p-12 text-center">
          <p className="text-sm text-zinc-600 mb-4">
            No purchases yet. Browse the marketplace to find health data.
          </p>
          <Link
            href="/marketplace"
            className="inline-flex px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
          >
            Browse Marketplace
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
          {purchases.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/purchases/${p.id}`)}
              onKeyDown={(e) => e.key === "Enter" && router.push(`/purchases/${p.id}`)}
              className="flex items-center justify-between px-5 py-4 hover:bg-zinc-800/30 transition-colors gap-4 cursor-pointer"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-zinc-200 truncate">
                  {p.title}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-zinc-500">
                    {formatDate(p.createdAt)}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                    {p.targetType === "dataset" ? "Dataset" : "Listing"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {p.txSignature && (
                  <a
                    href={`https://solscan.io/tx/${p.txSignature}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-emerald-500/70 hover:text-emerald-400"
                  >
                    View tx
                  </a>
                )}
                <span className="text-sm text-zinc-400">
                  {formatUsdc(p.amountUsdc)} USDC
                </span>
                <span className="text-zinc-500">→</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

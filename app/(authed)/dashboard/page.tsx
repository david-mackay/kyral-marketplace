"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import { LoadingDots } from "@/components/LoadingDots";
import { formatUsdc, truncateAddress, CATEGORY_LABELS } from "@/lib/format";

type ListingRow = {
  id: string;
  title: string;
  category: string;
  priceUsdc: number;
  status: string;
  documentIds: string[];
  createdAt: string;
};

type DatasetRow = {
  id: string;
  title: string;
  category: string;
  priceUsdc: number;
  status: string;
  totalContributions: number;
  createdAt: string;
};

type PurchaseRow = {
  id: string;
  targetType: string;
  targetId: string;
  title?: string;
  amountUsdc: number;
  txSignature: string | null;
  status: string;
  createdAt: string;
};

type EarningsSummary = {
  availableBalance: number;
  totalWithdrawn: number;
  totalEvents: number;
};

export default function DashboardPage() {
  const { user } = useWalletAuth();
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [datasets, setDatasets] = useState<DatasetRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [listingsRes, datasetsRes, purchasesRes, earningsRes] =
        await Promise.all([
          fetch("/api/listings?mine=true", { cache: "no-store" }),
          fetch("/api/datasets?mine=true", { cache: "no-store" }),
          fetch("/api/purchases", { cache: "no-store" }),
          fetch("/api/earnings", { cache: "no-store" }),
        ]);

      const listingsData = await listingsRes.json();
      const datasetsData = await datasetsRes.json();
      const purchasesData = await purchasesRes.json();
      const earningsData = await earningsRes.json();

      setListings(listingsData.listings ?? []);
      setDatasets(datasetsData.datasets ?? []);
      setPurchases(purchasesData.purchases ?? []);
      setEarnings({
        availableBalance: earningsData.availableBalance ?? 0,
        totalWithdrawn: earningsData.totalWithdrawn ?? 0,
        totalEvents: earningsData.totalEvents ?? 0,
      });
    } catch (error) {
      console.error("Failed to load dashboard data", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDelete = useCallback(
    async (type: "listing" | "dataset", id: string, title: string) => {
      if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
      setDeleting(id);
      try {
        const endpoint =
          type === "listing" ? `/api/listings/${id}` : `/api/datasets/${id}`;
        const res = await fetch(endpoint, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || "Failed to delete");
          return;
        }
        await loadAll();
      } catch {
        alert("Failed to delete");
      } finally {
        setDeleting(null);
      }
    },
    [loadAll]
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
          {user && (
            <p className="text-sm text-zinc-500 mt-1 font-mono">
              {truncateAddress(user.walletAddress)}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <Link
            href="/upload"
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
          >
            Upload Data
          </Link>
          <Link
            href="/datasets/create"
            className="px-4 py-2 rounded-lg border border-zinc-700 hover:border-zinc-600 text-zinc-300 text-sm font-medium transition-colors"
          >
            Create Dataset
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Available to Withdraw"
          value={formatUsdc(earnings?.availableBalance ?? 0)}
          color="emerald"
        />
        <StatCard
          label="Total Withdrawn"
          value={formatUsdc(earnings?.totalWithdrawn ?? 0)}
          color="amber"
        />
        <StatCard
          label="My Listings"
          value={String(listings.length)}
          color="blue"
        />
        <StatCard
          label="My Datasets"
          value={String(datasets.length)}
          color="purple"
        />
      </div>

      {/* Withdraw CTA */}
      {(earnings?.availableBalance ?? 0) > 0 && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-200">
              You have {formatUsdc(earnings?.availableBalance ?? 0)} USDC available
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              Head to Earnings to withdraw to your wallet
            </div>
          </div>
          <Link
            href="/earnings"
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
          >
            Withdraw
          </Link>
        </div>
      )}

      {/* My Listings */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-200">My Listings</h2>
          <Link
            href="/upload"
            className="text-sm text-emerald-400 hover:underline"
          >
            Create new
          </Link>
        </div>
        {listings.length === 0 ? (
          <EmptyState text="No listings yet. Upload data and create a listing to get started." />
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
            {listings.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between px-5 py-4 hover:bg-zinc-800/30 transition-colors"
              >
                <Link
                  href={`/marketplace/${l.id}?type=listing`}
                  className="flex items-center gap-3 min-w-0 flex-1"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-200 truncate">
                      {l.title}
                    </div>
                    <div className="text-xs text-zinc-600">
                      {CATEGORY_LABELS[l.category]} &middot;{" "}
                      {l.documentIds?.length ?? 0} file(s)
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={[
                      "text-xs px-2 py-0.5 rounded-md",
                      l.status === "active"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : l.status === "paused"
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-zinc-800 text-zinc-400",
                    ].join(" ")}
                  >
                    {l.status}
                  </span>
                  <span className="text-sm text-emerald-400 font-medium">
                    {formatUsdc(l.priceUsdc)}
                  </span>
                  <button
                    onClick={() =>
                      void handleDelete("listing", l.id, l.title)
                    }
                    disabled={deleting === l.id}
                    className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    title="Delete listing"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* My Datasets */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-200">My Datasets</h2>
          <Link
            href="/datasets/create"
            className="text-sm text-emerald-400 hover:underline"
          >
            Create new
          </Link>
        </div>
        {datasets.length === 0 ? (
          <EmptyState text="No datasets yet. Create a dataset to pool data from multiple contributors." />
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
            {datasets.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between px-5 py-4 hover:bg-zinc-800/30 transition-colors"
              >
                <Link
                  href={`/marketplace/${d.id}?type=dataset`}
                  className="min-w-0 flex-1"
                >
                  <div className="text-sm text-zinc-200 truncate">
                    {d.title}
                  </div>
                  <div className="text-xs text-zinc-600">
                    {CATEGORY_LABELS[d.category]} &middot;{" "}
                    {d.totalContributions} contributor(s)
                  </div>
                </Link>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={[
                      "text-xs px-2 py-0.5 rounded-md",
                      d.status === "open"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-zinc-800 text-zinc-400",
                    ].join(" ")}
                  >
                    {d.status}
                  </span>
                  <span className="text-sm text-emerald-400 font-medium">
                    {formatUsdc(d.priceUsdc)}
                  </span>
                  <button
                    onClick={() =>
                      void handleDelete("dataset", d.id, d.title)
                    }
                    disabled={deleting === d.id}
                    className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    title="Delete dataset"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Purchases */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-200">
            Recent Purchases
          </h2>
          {purchases.length > 0 && (
            <Link
              href="/purchases"
              className="text-sm text-emerald-400 hover:underline"
            >
              View all
            </Link>
          )}
        </div>
        {purchases.length === 0 ? (
          <EmptyState text="No purchases yet. Browse the marketplace to find data." />
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
            {purchases.slice(0, 5).map((p) => (
              <Link
                key={p.id}
                href={`/purchases/${p.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-zinc-800/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-zinc-200 truncate">
                    {p.title ?? `${p.targetType === "dataset" ? "Dataset" : "Listing"} purchase`}
                  </div>
                  <div className="text-xs text-zinc-600">
                    {new Date(p.createdAt).toLocaleDateString()}
                    {p.txSignature && (
                      <span className="ml-2">
                        tx: {p.txSignature.slice(0, 8)}...
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={[
                      "text-xs px-2 py-0.5 rounded-md",
                      p.status === "confirmed"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : p.status === "failed"
                        ? "bg-red-500/10 text-red-400"
                        : "bg-amber-500/10 text-amber-400",
                    ].join(" ")}
                  >
                    {p.status}
                  </span>
                  <span className="text-sm text-zinc-300">
                    {formatUsdc(p.amountUsdc)}
                  </span>
                  <span className="text-zinc-500">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "emerald" | "amber" | "blue" | "purple";
}) {
  const colorMap = {
    emerald: "from-emerald-500/10 border-emerald-500/20 text-emerald-400",
    amber: "from-amber-500/10 border-amber-500/20 text-amber-400",
    blue: "from-blue-500/10 border-blue-500/20 text-blue-400",
    purple: "from-purple-500/10 border-purple-500/20 text-purple-400",
  };

  return (
    <div
      className={`rounded-xl border bg-gradient-to-br to-transparent p-5 ${colorMap[color]}`}
    >
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 p-8 text-center">
      <p className="text-sm text-zinc-600">{text}</p>
    </div>
  );
}

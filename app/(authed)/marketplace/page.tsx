"use client";

import { useCallback, useEffect, useState } from "react";
import { ListingCard } from "@/components/ListingCard";
import { DatasetCard } from "@/components/DatasetCard";
import { LoadingDots } from "@/components/LoadingDots";
import { DATA_CATEGORIES, CATEGORY_LABELS } from "@/lib/format";

type ListingRow = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priceUsdc: number;
  documentIds: string[];
  status: string;
  createdAt: string;
  ownerWallet: string | null;
  ownerName: string | null;
};

type DatasetRow = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priceUsdc: number;
  totalContributions: number;
  status: string;
  createdAt: string;
  creatorWallet: string | null;
  creatorName: string | null;
};

type Tab = "all" | "listings" | "datasets";

export default function MarketplacePage() {
  const [tab, setTab] = useState<Tab>("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [datasets, setDatasets] = useState<DatasetRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category !== "all") params.set("category", category);
      if (search) params.set("search", search);
      const qs = params.toString() ? `?${params.toString()}` : "";

      const [listingsRes, datasetsRes] = await Promise.all([
        tab !== "datasets"
          ? fetch(`/api/listings${qs}`, { cache: "no-store" })
          : null,
        tab !== "listings"
          ? fetch(`/api/datasets${qs}`, { cache: "no-store" })
          : null,
      ]);

      if (listingsRes) {
        const data = await listingsRes.json();
        setListings(data.listings ?? []);
      } else {
        setListings([]);
      }

      if (datasetsRes) {
        const data = await datasetsRes.json();
        setDatasets(data.datasets ?? []);
      } else {
        setDatasets([]);
      }
    } catch (error) {
      console.error("Failed to load marketplace data", error);
    } finally {
      setLoading(false);
    }
  }, [tab, category, search]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Marketplace</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Browse and purchase health data listings and curated datasets.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Tab */}
        <div className="flex rounded-lg border border-zinc-800 overflow-hidden">
          {(["all", "listings", "datasets"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                "px-4 py-2 text-sm font-medium transition-colors capitalize",
                tab === t
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50",
              ].join(" ")}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Category */}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900 text-sm text-zinc-300 outline-none focus:border-zinc-600"
        >
          <option value="all">All Categories</option>
          {DATA_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-zinc-800 bg-zinc-900 text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-600"
          />
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="text-zinc-400 text-sm flex items-center gap-2">
            Loading <LoadingDots />
          </span>
        </div>
      ) : listings.length === 0 && datasets.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-zinc-600 text-sm">
            No results found. Try adjusting your filters.
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {datasets.map((d) => (
            <DatasetCard
              key={`dataset-${d.id}`}
              id={d.id}
              title={d.title}
              description={d.description}
              category={d.category}
              priceUsdc={d.priceUsdc}
              totalContributions={d.totalContributions}
              status={d.status}
              creatorWallet={d.creatorWallet}
              creatorName={d.creatorName}
              createdAt={d.createdAt}
            />
          ))}
          {listings.map((l) => (
            <ListingCard
              key={`listing-${l.id}`}
              id={l.id}
              title={l.title}
              description={l.description}
              category={l.category}
              priceUsdc={l.priceUsdc}
              ownerWallet={l.ownerWallet}
              ownerName={l.ownerName}
              createdAt={l.createdAt}
              documentCount={l.documentIds?.length}
              type="listing"
            />
          ))}
        </div>
      )}
    </div>
  );
}

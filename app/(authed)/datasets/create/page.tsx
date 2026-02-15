"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingDots } from "@/components/LoadingDots";
import { DATA_CATEGORIES, CATEGORY_LABELS, formatUsdc } from "@/lib/format";

type ListingRow = {
  id: string;
  title: string;
  category: string;
  priceUsdc: number;
  status: string;
};

export default function CreateDatasetPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("mixed");
  const [priceUsdc, setPriceUsdc] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For adding initial contributions
  const [myListings, setMyListings] = useState<ListingRow[]>([]);
  const [selectedListingIds, setSelectedListingIds] = useState<Set<string>>(
    new Set()
  );
  const [loadingListings, setLoadingListings] = useState(true);

  const loadMyListings = useCallback(async () => {
    setLoadingListings(true);
    try {
      const res = await fetch("/api/listings?mine=true", {
        cache: "no-store",
      });
      const data = await res.json();
      setMyListings(data.listings ?? []);
    } catch {
      // ignore
    } finally {
      setLoadingListings(false);
    }
  }, []);

  useEffect(() => {
    void loadMyListings();
  }, [loadMyListings]);

  const toggleListing = (id: string) => {
    setSelectedListingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    const price = parseFloat(priceUsdc);
    if (isNaN(price) || price <= 0) {
      setError("Enter a valid price");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      // Create the dataset
      const createRes = await fetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          priceUsdc: Math.round(price * 1_000_000),
        }),
      });

      if (!createRes.ok) {
        const data = await createRes.json();
        throw new Error(data.error || "Failed to create dataset");
      }

      const { dataset } = await createRes.json();

      // Add initial contributions from selected listings
      for (const listingId of selectedListingIds) {
        await fetch(`/api/datasets/${dataset.id}/contribute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId }),
        });
      }

      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create dataset");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Create Dataset</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Assemble a curated dataset from your listings and invite others to
          contribute. Revenue is split proportionally.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-5">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Dataset Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Comprehensive Diabetes Dataset"
            className="w-full px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-600"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what kind of data this dataset contains and who it's useful for..."
            rows={4}
            className="w-full px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-600 resize-none"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900 text-sm text-zinc-200 outline-none focus:border-zinc-600"
          >
            {DATA_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        {/* Price */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Dataset Price (USDC)
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
              $
            </span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={priceUsdc}
              onChange={(e) => setPriceUsdc(e.target.value)}
              placeholder="0.00"
              className="w-full pl-8 pr-16 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-600"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
              USDC
            </span>
          </div>
        </div>

        {/* Initial Contributions */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Add Your Listings (optional)
          </label>
          <p className="text-xs text-zinc-500 mb-3">
            Select your listings to include as initial contributions to this
            dataset.
          </p>

          {loadingListings ? (
            <div className="text-sm text-zinc-500 flex items-center gap-2">
              Loading <LoadingDots />
            </div>
          ) : myListings.length === 0 ? (
            <div className="text-sm text-zinc-600 border border-dashed border-zinc-800 rounded-lg p-4 text-center">
              No listings yet. Create listings first from the Upload page.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {myListings.map((listing) => (
                <label
                  key={listing.id}
                  className={[
                    "flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors",
                    selectedListingIds.has(listing.id)
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : "border-zinc-800 hover:border-zinc-700",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={selectedListingIds.has(listing.id)}
                    onChange={() => toggleListing(listing.id)}
                    className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/50"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate">
                      {listing.title}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {CATEGORY_LABELS[listing.category] ?? listing.category} &middot;{" "}
                      {formatUsdc(listing.priceUsdc)}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          onClick={() => void handleCreate()}
          disabled={creating}
          className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors disabled:opacity-50"
        >
          {creating ? (
            <span className="inline-flex items-center gap-2">
              Creating Dataset <LoadingDots />
            </span>
          ) : (
            "Create Dataset"
          )}
        </button>
      </div>
    </div>
  );
}

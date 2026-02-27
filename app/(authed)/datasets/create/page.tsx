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

type DatasetPlan = {
  title: string;
  description: string;
  category: string;
  suggestedPriceUsdc: number;
  dataRequirements: string[];
  targetDemographics: string[];
  scientificValue: string;
  suggestedBiomarkers: string[];
  estimatedSampleSize: string;
};

export default function CreateDatasetPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("mixed");
  const [priceUsdc, setPriceUsdc] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // BioAgents AI planner
  const [aiTopic, setAiTopic] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPlan, setAiPlan] = useState<DatasetPlan | null>(null);

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

  const handleGenerate = async () => {
    if (!aiTopic.trim() || aiTopic.trim().length < 5) {
      setAiError("Describe your research topic in at least a few words.");
      return;
    }
    setAiGenerating(true);
    setAiError(null);
    setAiPlan(null);

    try {
      const res = await fetch("/api/bios/plan-dataset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: aiTopic.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate plan");
      }

      const { plan } = (await res.json()) as { plan: DatasetPlan };
      setAiPlan(plan);

      // Auto-fill form fields
      setTitle(plan.title);
      setDescription(plan.description);
      if (DATA_CATEGORIES.includes(plan.category)) {
        setCategory(plan.category);
      }
      setPriceUsdc(String(plan.suggestedPriceUsdc));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setAiGenerating(false);
    }
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
          Create a call to action for others to pool their data. Revenue is
          split equally among contributors &mdash; you earn by contributing your
          own data, not just by creating the dataset.
        </p>
      </div>

      {/* ── BioAgents AI Planner ────────────────────────────────────── */}
      <div className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-950/30 to-zinc-950 p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20">
            <svg
              viewBox="0 0 24 24"
              className="h-4.5 w-4.5 text-blue-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-blue-300">
              BioAgents Dataset Planner
            </h2>
            <p className="text-xs text-zinc-500">
              Powered by BIO Protocol &middot; AI-assisted dataset design
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Describe your research topic
          </label>
          <textarea
            value={aiTopic}
            onChange={(e) => setAiTopic(e.target.value)}
            placeholder="e.g. Effects of intermittent fasting on metabolic biomarkers in adults with Type 2 diabetes..."
            rows={3}
            disabled={aiGenerating}
            className="w-full px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-blue-500/50 resize-none disabled:opacity-50"
          />
        </div>

        {aiError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {aiError}
          </div>
        )}

        <button
          onClick={() => void handleGenerate()}
          disabled={aiGenerating || !aiTopic.trim()}
          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {aiGenerating ? (
            <span className="inline-flex items-center gap-2">
              Generating plan <LoadingDots />
            </span>
          ) : (
            "Generate Dataset Plan"
          )}
        </button>

        {/* AI-generated insights panel */}
        {aiPlan && (
          <div className="mt-2 space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <p className="text-xs font-medium text-emerald-400">
                Plan generated &mdash; form auto-filled below. Additional
                insights:
              </p>
            </div>

            <InsightBlock title="Scientific Value">
              <p className="text-sm text-zinc-400">{aiPlan.scientificValue}</p>
            </InsightBlock>

            <InsightBlock title="Suggested Biomarkers">
              <div className="flex flex-wrap gap-1.5">
                {aiPlan.suggestedBiomarkers.map((b) => (
                  <span
                    key={b}
                    className="px-2 py-0.5 rounded-full bg-zinc-800 text-xs text-zinc-300 border border-zinc-700"
                  >
                    {b}
                  </span>
                ))}
              </div>
            </InsightBlock>

            <InsightBlock title="Data Requirements">
              <ul className="text-sm text-zinc-400 space-y-1 list-disc list-inside">
                {aiPlan.dataRequirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </InsightBlock>

            <InsightBlock title="Target Demographics">
              <div className="flex flex-wrap gap-1.5">
                {aiPlan.targetDemographics.map((d) => (
                  <span
                    key={d}
                    className="px-2 py-0.5 rounded-full bg-zinc-800 text-xs text-zinc-300 border border-zinc-700"
                  >
                    {d}
                  </span>
                ))}
              </div>
            </InsightBlock>

            <InsightBlock title="Recommended Sample Size">
              <p className="text-sm text-zinc-400">
                {aiPlan.estimatedSampleSize}
              </p>
            </InsightBlock>
          </div>
        )}
      </div>

      {/* ── Dataset Form ───────────────────────────────────────────── */}
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
                      {CATEGORY_LABELS[listing.category] ?? listing.category}{" "}
                      &middot; {formatUsdc(listing.priceUsdc)}
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

function InsightBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
        {title}
      </p>
      {children}
    </div>
  );
}

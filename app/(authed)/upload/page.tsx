"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentUploader } from "@/components/DocumentUploader";
import { LoadingDots } from "@/components/LoadingDots";
import { DATA_CATEGORIES, CATEGORY_LABELS } from "@/lib/format";

type DocumentRow = {
  id: string;
  ownerUserId: string;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  status: "uploaded" | "parsed" | "error";
  createdAt: string;
};

export default function UploadPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Listing form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [priceUsdc, setPriceUsdc] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/documents/upload", { cache: "no-store" });
      const data = await res.json();
      setDocuments(data.documents ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const toggleDoc = (docId: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const handleCreateListing = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (selectedDocIds.size === 0) {
      setError("Select at least one document");
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
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          documentIds: Array.from(selectedDocIds),
          priceUsdc: Math.round(price * 1_000_000), // Convert to smallest unit
          status: "active",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create listing");
      }

      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create listing");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">
          Upload & List Data
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Upload your health data files, then create a marketplace listing.
        </p>
      </div>

      {/* Step 1: Upload */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">
          Step 1: Upload Files
        </h2>
        <DocumentUploader
          onUploadComplete={() => void loadDocuments()}
          documents={documents}
          onRefresh={() => void loadDocuments()}
        />
      </section>

      {/* Step 2: Create Listing */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-200">
          Step 2: Create Listing
        </h2>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-5">
          {/* Select Documents */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Select Documents
            </label>
            {loading ? (
              <div className="text-sm text-zinc-500 flex items-center gap-2">
                Loading <LoadingDots />
              </div>
            ) : documents.length === 0 ? (
              <div className="text-sm text-zinc-600">
                No documents uploaded yet. Upload files above first.
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <label
                    key={doc.id}
                    className={[
                      "flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors",
                      selectedDocIds.has(doc.id)
                        ? "border-emerald-500/50 bg-emerald-500/5"
                        : "border-zinc-800 hover:border-zinc-700",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDocIds.has(doc.id)}
                      onChange={() => toggleDoc(doc.id)}
                      className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/50"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-200 truncate">
                        {doc.originalFileName}
                      </div>
                      <div className="text-xs text-zinc-600">
                        {Math.round(doc.sizeBytes / 1024)} KB
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Blood Work Results 2025"
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
              placeholder="Describe the data you're listing..."
              rows={3}
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
              Price (USDC)
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

          {/* Submit */}
          <button
            onClick={() => void handleCreateListing()}
            disabled={creating}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors disabled:opacity-50"
          >
            {creating ? (
              <span className="inline-flex items-center gap-2">
                Creating Listing <LoadingDots />
              </span>
            ) : (
              "Create Listing"
            )}
          </button>
        </div>
      </section>
    </div>
  );
}

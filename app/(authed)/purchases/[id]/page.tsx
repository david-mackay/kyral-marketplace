"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { LoadingDots } from "@/components/LoadingDots";
import { formatUsdc, formatDate } from "@/lib/format";

type FileInfo = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  downloadUrl: string | null;
};

export default function PurchaseDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [title, setTitle] = useState<string | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [purchasesRes, accessRes] = await Promise.all([
        fetch("/api/purchases", { cache: "no-store" }),
        fetch(`/api/data-access/${id}`, { cache: "no-store" }),
      ]);

      const purchasesData = await purchasesRes.json();
      const accessData = await accessRes.json();

      if (!accessRes.ok) {
        setError(accessData.error ?? "Failed to load purchase data");
        return;
      }

      const purchase = (purchasesData.purchases ?? []).find(
        (p: { id: string }) => p.id === id
      );
      setTitle(purchase?.title ?? "Purchase");
      setFiles(accessData.files ?? []);
    } catch (err) {
      setError("Failed to load purchase");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-zinc-400 text-sm flex items-center gap-2">
          Loading <LoadingDots />
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl space-y-6">
        <Link
          href="/purchases"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← Back to Purchases
        </Link>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <p className="text-red-400">{error}</p>
          <p className="text-sm text-zinc-500 mt-2">
            This purchase may not exist or you may not have access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/purchases"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 19.5L8.25 12l7.5-7.5"
          />
        </svg>
        Back to Purchases
      </Link>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 sm:p-8">
        <h1 className="text-xl font-bold text-zinc-100">{title}</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Download your purchased data files below.
        </p>

        {files.length === 0 ? (
          <div className="mt-8 rounded-lg border border-dashed border-zinc-700 bg-zinc-800/30 p-8 text-center">
            <p className="text-sm text-zinc-500">
              No files available for this purchase.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-300">
              Files ({files.length})
            </h2>
            <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 overflow-hidden">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between px-4 py-4 bg-zinc-900/30 hover:bg-zinc-800/30 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-200 truncate">
                      {f.fileName}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {formatFileSize(f.sizeBytes)}
                      {f.contentType && ` · ${f.contentType}`}
                    </div>
                  </div>
                  {f.downloadUrl ? (
                    <a
                      href={f.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      download={f.fileName}
                      className="shrink-0 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
                    >
                      Download
                    </a>
                  ) : (
                    <span className="text-xs text-zinc-500">Unavailable</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

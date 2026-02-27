"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { LoadingDots } from "@/components/LoadingDots";

type FileInfo = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  downloadUrl: string | null;
};

type PurchaseInfo = {
  id: string;
  title: string;
  targetType: "listing" | "dataset";
  targetId: string;
};

export default function PurchaseDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [purchase, setPurchase] = useState<PurchaseInfo | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const purchasesRes = await fetch("/api/purchases", { cache: "no-store" });
      const purchasesData = await purchasesRes.json();

      const found = (purchasesData.purchases ?? []).find(
        (p: { id: string }) => p.id === id
      );
      const purchaseInfo: PurchaseInfo = {
        id,
        title: found?.title ?? "Purchase",
        targetType: found?.targetType ?? "listing",
        targetId: found?.targetId ?? "",
      };
      setPurchase(purchaseInfo);

      // For listings, fetch individual file URLs
      if (purchaseInfo.targetType === "listing") {
        const accessRes = await fetch(`/api/data-access/${id}`, {
          cache: "no-store",
        });
        const accessData = await accessRes.json();
        if (!accessRes.ok) {
          setError(accessData.error ?? "Failed to load purchase data");
          return;
        }
        setFiles(accessData.files ?? []);
      }
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

  const handleDownloadZip = useCallback(async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/data-access/${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ?? "Download failed"
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ??
        "dataset.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }, [id]);

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

  const isDataset = purchase?.targetType === "dataset";

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
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-xl font-bold text-zinc-100">
            {purchase?.title}
          </h1>
          {isDataset && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400 font-medium">
              Dataset
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-500 mt-1">
          {isDataset
            ? "Download the full dataset as a ZIP archive. The archive contains all files from currently active contributors."
            : "Download your purchased data files below."}
        </p>

        {isDataset ? (
          <div className="mt-6">
            <button
              onClick={() => void handleDownloadZip()}
              disabled={downloading}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {downloading ? (
                <>
                  Preparing download <LoadingDots />
                </>
              ) : (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                    />
                  </svg>
                  Download Dataset ZIP
                </>
              )}
            </button>
            <p className="text-xs text-zinc-600 text-center mt-3">
              The dataset is assembled in real-time from active contributions.
              Contributors can join or leave the dataset at any time.
            </p>
          </div>
        ) : files.length === 0 ? (
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

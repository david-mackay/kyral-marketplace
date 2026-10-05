"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Sheet, SkeletonRows } from "@/components/ui";

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

  if (loading) return <SkeletonRows rows={3} />;

  const isDataset = purchase?.targetType === "dataset";

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/purchases" className="text-sm text-zinc-500 hover:text-zinc-300">← Library</Link>

      <Sheet>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">{purchase?.title}</h1>
          {isDataset && <span className="chip !text-sky-200">Pooled</span>}
        </div>
        <p className="text-sm text-zinc-500 mt-2">
          {isDataset
            ? "One archive with every current contributor's de-identified data."
            : "De-identified files. Dates are shifted and identifiers removed."}
        </p>

        {error ? (
          <p className="mt-6 text-sm text-red-300">{error}</p>
        ) : isDataset ? (
          <button onClick={() => void handleDownloadZip()} disabled={downloading} className="btn-liquid w-full mt-6">
            {downloading ? "Preparing…" : "Download archive"}
          </button>
        ) : files.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-500">No files available for this purchase.</p>
        ) : (
          <ul className="divide-hairline mt-6">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm text-zinc-200 truncate">{f.fileName}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{formatFileSize(f.sizeBytes)}</div>
                </div>
                {f.downloadUrl ? (
                  <a href={f.downloadUrl} target="_blank" rel="noreferrer" download={f.fileName} className="btn-ghost btn-sm">
                    Download
                  </a>
                ) : (
                  <span className="text-xs text-zinc-500">Unavailable</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}

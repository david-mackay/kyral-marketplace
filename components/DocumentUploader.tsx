"use client";

import { useCallback, useRef, useState } from "react";
import { LoadingDots } from "@/components/LoadingDots";

type DocumentRow = {
  id: string;
  ownerUserId: string;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  status: "uploaded" | "parsed" | "error";
  createdAt: string;
};

interface DocumentUploaderProps {
  onUploadComplete?: (doc: DocumentRow) => void;
  documents?: DocumentRow[];
  onRefresh?: () => void;
}

export function DocumentUploader({
  onUploadComplete,
  documents = [],
  onRefresh,
}: DocumentUploaderProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        document?: DocumentRow;
      };
      if (!res.ok)
        throw new Error(body.error || `Upload failed (${res.status})`);
      setFile(null);
      if (body.document && onUploadComplete) {
        onUploadComplete(body.document);
      }
      onRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }, [file, onUploadComplete, onRefresh]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">
            Upload Health Data
          </h3>
          <p className="text-sm text-zinc-500 mt-1">
            Upload PDFs, CSVs, or text files containing health data to list on
            the marketplace.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.csv,text/plain,application/pdf,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={[
              "flex items-center justify-center gap-2 px-4 py-2.5 text-sm rounded-lg border transition-all",
              file
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                : "border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:bg-zinc-800/50",
            ].join(" ")}
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            {file ? "Change file" : "Choose file"}
          </button>

          {file && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 max-w-full">
              <span className="truncate flex-1 min-w-0">{file.name}</span>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="p-0.5 rounded-full hover:bg-zinc-700 text-zinc-500 shrink-0"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => void upload()}
            disabled={loading || !file}
            className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                Uploading <LoadingDots />
              </span>
            ) : (
              "Upload"
            )}
          </button>
        </div>
      </div>

      {documents.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
          <div className="px-5 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100">
              Your Documents
            </h3>
            <span className="text-xs text-zinc-500">
              {documents.length} file(s)
            </span>
          </div>
          {documents.map((d) => (
            <div key={d.id} className="px-5 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-zinc-200 truncate">
                  {d.originalFileName}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {d.contentType} &middot; {Math.round(d.sizeBytes / 1024)} KB
                </div>
              </div>
              <span
                className={[
                  "text-xs px-2 py-1 rounded-md border shrink-0",
                  d.status === "uploaded"
                    ? "border-zinc-700 text-zinc-400"
                    : d.status === "error"
                    ? "border-red-500/30 text-red-400 bg-red-500/10"
                    : "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
                ].join(" ")}
              >
                {d.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import {
  formatUsdc,
  truncateAddress,
  formatDate,
  CATEGORY_LABELS,
} from "@/lib/format";

interface DatasetCardProps {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  priceUsdc: number;
  totalContributions: number;
  status: string;
  creatorWallet?: string | null;
  creatorName?: string | null;
  createdAt: string;
}

export function DatasetCard({
  id,
  title,
  description,
  category,
  priceUsdc,
  totalContributions,
  status,
  creatorWallet,
  creatorName,
  createdAt,
}: DatasetCardProps) {
  return (
    <Link
      href={`/marketplace/${id}?type=dataset`}
      className="card-glow block rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 hover:border-zinc-700 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400 font-medium">
            Dataset
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-800 text-xs text-zinc-400 font-medium">
            {CATEGORY_LABELS[category] ?? category}
          </span>
        </div>
        <span className="text-emerald-400 font-semibold text-sm">
          {formatUsdc(priceUsdc)}
        </span>
      </div>

      <h3 className="text-base font-semibold text-zinc-100 group-hover:text-emerald-400 transition-colors line-clamp-1">
        {title}
      </h3>

      {description && (
        <p className="mt-1.5 text-sm text-zinc-500 line-clamp-2">
          {description}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between text-xs text-zinc-600">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-400">
            {(creatorName ?? creatorWallet ?? "?").charAt(0).toUpperCase()}
          </div>
          <span>
            {creatorName ??
              (creatorWallet ? truncateAddress(creatorWallet) : "Unknown")}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
              />
            </svg>
            {totalContributions} contributor(s)
          </span>
          <span>{formatDate(createdAt)}</span>
        </div>
      </div>

      {status === "open" && (
        <div className="mt-3 pt-3 border-t border-zinc-800/50">
          <span className="text-xs text-emerald-400/80 font-medium">
            Accepting contributions
          </span>
        </div>
      )}
    </Link>
  );
}

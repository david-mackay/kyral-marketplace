"use client";

import Link from "next/link";
import { formatUsdc, truncateAddress, formatDate, CATEGORY_LABELS } from "@/lib/format";

interface ListingCardProps {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  priceUsdc: number;
  ownerWallet?: string | null;
  ownerName?: string | null;
  createdAt: string;
  documentCount?: number;
  type: "listing";
}

export function ListingCard({
  id,
  title,
  description,
  category,
  priceUsdc,
  ownerWallet,
  ownerName,
  createdAt,
  documentCount,
}: ListingCardProps) {
  return (
    <Link
      href={`/marketplace/${id}?type=listing`}
      className="card-glow block rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 hover:border-zinc-700 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-800 text-xs text-zinc-400 font-medium">
          {CATEGORY_LABELS[category] ?? category}
        </span>
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
            {(ownerName ?? ownerWallet ?? "?").charAt(0).toUpperCase()}
          </div>
          <span>
            {ownerName ?? (ownerWallet ? truncateAddress(ownerWallet) : "Unknown")}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {documentCount !== undefined && (
            <span>{documentCount} file(s)</span>
          )}
          <span>{formatDate(createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

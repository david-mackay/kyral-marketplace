"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import { LoadingDots } from "@/components/LoadingDots";
import {
  formatUsdc,
  truncateAddress,
  formatDate,
  CATEGORY_LABELS,
} from "@/lib/format";
import Link from "next/link";

export default function MarketplaceDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const type = searchParams.get("type") ?? "listing";
  const { user } = useWalletAuth();

  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [contributions, setContributions] = useState<
    Record<string, unknown>[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchased, setPurchased] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint =
        type === "dataset" ? `/api/datasets/${id}` : `/api/listings/${id}`;
      const res = await fetch(endpoint, { cache: "no-store" });
      const json = await res.json();
      if (type === "dataset") {
        setData(json.dataset);
        setContributions(json.contributions ?? []);
      } else {
        setData(json.listing);
        setContributions(json.contributions ?? []);
      }
    } catch (error) {
      console.error("Failed to load detail", error);
    } finally {
      setLoading(false);
    }
  }, [id, type]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handlePurchase = useCallback(async () => {
    if (!data) return;
    setPurchasing(true);
    setPurchaseError(null);
    try {
      // Step 1: Initiate purchase
      const initRes = await fetch("/api/purchases/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: type,
          targetId: id,
        }),
      });

      if (!initRes.ok) {
        const err = await initRes.json();
        throw new Error(err.error || "Failed to initiate purchase");
      }

      const { purchase, escrowAddress, amountUsdc } = await initRes.json();

      // In a full implementation, we would:
      // 1. Build SPL token transfer transaction
      // 2. Have user sign it
      // 3. Submit to Solana
      // 4. Call /api/purchases/confirm with txSignature

      // For now, show a mock confirmation
      setPurchased(true);
    } catch (error) {
      setPurchaseError(
        error instanceof Error ? error.message : "Purchase failed"
      );
    } finally {
      setPurchasing(false);
    }
  }, [data, id, type]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-zinc-400 text-sm flex items-center gap-2">
          Loading <LoadingDots />
        </span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <div className="text-zinc-500">Not found.</div>
        <Link
          href="/marketplace"
          className="mt-4 inline-block text-sm text-emerald-400 hover:underline"
        >
          Back to Marketplace
        </Link>
      </div>
    );
  }

  const title = data.title as string;
  const description = data.description as string | null;
  const category = data.category as string;
  const priceUsdc = data.priceUsdc as number;
  const createdAt = data.createdAt as string;
  const ownerWallet =
    (data.ownerWallet as string) ??
    (data.creatorWallet as string) ??
    "";
  const ownerName =
    (data.ownerName as string) ?? (data.creatorName as string) ?? null;
  const totalContributions =
    (data.totalContributions as number) ?? 0;
  const isOwner =
    user?.id === (data.ownerUserId ?? data.creatorUserId);

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/marketplace"
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
        Back to Marketplace
      </Link>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {type === "dataset" && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400 font-medium">
                  Dataset
                </span>
              )}
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-800 text-xs text-zinc-400 font-medium">
                {CATEGORY_LABELS[category] ?? category}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-100">
              {title}
            </h1>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold text-emerald-400">
              {formatUsdc(priceUsdc)}
            </div>
            <div className="text-xs text-zinc-500 mt-1">USDC per access</div>
          </div>
        </div>

        {/* Description */}
        {description && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-300 mb-2">
              Description
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">
              {description}
            </p>
          </div>
        )}

        {/* Metadata */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-zinc-800">
          <div>
            <div className="text-xs text-zinc-500 mb-1">Owner</div>
            <div className="text-sm text-zinc-300">
              {ownerName ?? truncateAddress(ownerWallet)}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-1">Listed</div>
            <div className="text-sm text-zinc-300">
              {formatDate(createdAt)}
            </div>
          </div>
          {type === "dataset" && (
            <div>
              <div className="text-xs text-zinc-500 mb-1">Contributors</div>
              <div className="text-sm text-zinc-300">
                {totalContributions}
              </div>
            </div>
          )}
          {type === "listing" && Array.isArray(data.documentIds) ? (
            <div>
              <div className="text-xs text-zinc-500 mb-1">Files</div>
              <div className="text-sm text-zinc-300">
                {(data.documentIds as string[]).length}
              </div>
            </div>
          ) : null}
        </div>

        {/* Contributors list for datasets */}
        {type === "dataset" && contributions.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-300 mb-3">
              Contributors
            </h2>
            <div className="space-y-2">
              {contributions.map((c) => (
                <div
                  key={c.id as string}
                  className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-800"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] text-zinc-400">
                      {(
                        (c.contributorName as string) ??
                        (c.contributorWallet as string) ??
                        "?"
                      )
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm text-zinc-300">
                        {(c.contributorName as string) ??
                          truncateAddress(
                            (c.contributorWallet as string) ?? ""
                          )}
                      </div>
                      <div className="text-xs text-zinc-600">
                        {c.listingTitle as string}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500">
                    Share: {c.shareNumerator as number}/
                    {totalContributions || 1}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Purchase */}
        {purchaseError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {purchaseError}
          </div>
        )}

        {purchased ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-center space-y-2">
            <div className="text-emerald-400 font-medium">
              Purchase initiated!
            </div>
            <div className="text-xs text-zinc-400">
              Complete the USDC transfer in your wallet to finalize the
              purchase.
            </div>
          </div>
        ) : (
          !isOwner && (
            <button
              onClick={() => void handlePurchase()}
              disabled={purchasing}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors disabled:opacity-50"
            >
              {purchasing ? (
                <span className="inline-flex items-center gap-2">
                  Processing <LoadingDots />
                </span>
              ) : (
                `Purchase for ${formatUsdc(priceUsdc)} USDC`
              )}
            </button>
          )
        )}

        {isOwner && (
          <div className="text-center text-xs text-zinc-500 py-2">
            This is your {type}. You cannot purchase your own data.
          </div>
        )}
      </div>
    </div>
  );
}

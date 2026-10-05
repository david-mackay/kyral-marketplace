"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useAppKitAccount } from "@reown/appkit/react";
import { useConfig } from "wagmi";
import type { Address } from "viem";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import { LoadingDots } from "@/components/LoadingDots";
import {
  formatUsdc,
  truncateAddress,
  formatDate,
  CATEGORY_LABELS,
} from "@/lib/format";
import { payForItem } from "@/lib/purchase";
import { addressUrl, MARKETPLACE_ADDRESS, txUrl, USDC_HAS_FAUCET } from "@/lib/chain";
import { UsdcFaucetButton } from "@/components/UsdcFaucetButton";
import Link from "next/link";

export default function MarketplaceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const type = searchParams.get("type") ?? "listing";
  const { user } = useWalletAuth();
  const { address, isConnected } = useAppKitAccount();
  const wagmiConfig = useConfig();

  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [contributions, setContributions] = useState<
    Record<string, unknown>[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchased, setPurchased] = useState(false);
  const [purchaseTx, setPurchaseTx] = useState<string | null>(null);
  const [myListings, setMyListings] = useState<{ id: string; title: string; category: string }[]>([]);
  const [contributing, setContributing] = useState<string | null>(null);
  const [contributeError, setContributeError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setContributeError(null);
    try {
      const endpoint =
        type === "dataset" ? `/api/datasets/${id}` : `/api/listings/${id}`;
      const res = await fetch(endpoint, { cache: "no-store" });
      const json = await res.json();
      if (type === "dataset") {
        setData(json.dataset);
        setContributions(json.contributions ?? []);
        // Load user's listings for the contribute section
        const listingsRes = await fetch("/api/listings?mine=true", {
          cache: "no-store",
        });
        const listingsData = await listingsRes.json();
        const contributionsList = json.contributions ?? [];
        const contributedIds = new Set(
          contributionsList.map((c: { listingId?: string }) => c.listingId)
        );
        const available = (listingsData.listings ?? [])
          .filter(
            (l: { id: string; status: string }) =>
              l.status === "active" && !contributedIds.has(l.id)
          )
          .map((l: { id: string; title: string; category: string }) => ({
            id: l.id,
            title: l.title,
            category: l.category,
          }));
        setMyListings(available);
      } else {
        setData(json.listing);
        setContributions(json.contributions ?? []);
        setMyListings([]);
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
    if (!data || !isConnected || !address) {
      setPurchaseError("Wallet not connected");
      return;
    }

    setPurchasing(true);
    setPurchaseError(null);
    try {
      // Step 1: Server syncs the item onchain and returns a quote
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

      const { purchase, ...quote } = await initRes.json();

      // Step 2: Pay the marketplace contract (revenue is split onchain)
      const txHash = await payForItem(wagmiConfig, address as Address, quote);

      // Step 3: Server verifies the Purchased event and records access
      const confirmRes = await fetch("/api/purchases/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseId: purchase.id,
          txHash,
        }),
      });

      if (!confirmRes.ok) {
        const err = await confirmRes.json();
        throw new Error(err.error || "Failed to confirm purchase");
      }

      setPurchaseTx(txHash);
      setPurchased(true);
    } catch (error) {
      setPurchaseError(
        error instanceof Error
          ? (error as { shortMessage?: string }).shortMessage ?? error.message
          : "Purchase failed"
      );
    } finally {
      setPurchasing(false);
    }
  }, [data, id, type, isConnected, address, wagmiConfig]);

  const handleContribute = useCallback(
    async (listingId: string) => {
      setContributing(listingId);
      setContributeError(null);
      try {
        const res = await fetch(`/api/datasets/${id}/contribute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Failed to contribute");
        }
        await loadData();
      } catch (error) {
        setContributeError(
          error instanceof Error ? error.message : "Failed to contribute"
        );
      } finally {
        setContributing(null);
      }
    },
    [id, loadData]
  );

  const handleRevoke = useCallback(
    async (listingId: string) => {
      if (!confirm("Revoke this contribution? You will no longer earn from future purchases of this dataset.")) return;
      setRevoking(listingId);
      setContributeError(null);
      try {
        const res = await fetch(`/api/datasets/${id}/contribute`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Failed to revoke");
        }
        await loadData();
      } catch (error) {
        setContributeError(
          error instanceof Error ? error.message : "Failed to revoke"
        );
      } finally {
        setRevoking(null);
      }
    },
    [id, loadData]
  );

  const handleDelete = useCallback(async () => {
    const label = type === "dataset" ? "dataset" : "listing";
    if (!confirm(`Delete this ${label}? This cannot be undone.`)) return;
    setDeleteLoading(true);
    try {
      const endpoint =
        type === "dataset" ? `/api/datasets/${id}` : `/api/listings/${id}`;
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to delete");
        return;
      }
      router.push("/dashboard");
    } catch {
      alert("Failed to delete");
    } finally {
      setDeleteLoading(false);
    }
  }, [id, type, router]);

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

        <ProvenancePanel
          contentHash={data.onchainContentHash as string | null}
          version={data.onchainVersion as number | null}
          txHash={data.onchainTxHash as string | null}
          type={type}
        />

        {/* Contributors list for datasets */}
        {type === "dataset" && contributions.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-300 mb-3">
              Contributors
            </h2>
            <div className="space-y-2">
              {contributions.map((c) => {
                const isMyContribution =
                  user?.id === (c.contributorUserId as string);
                return (
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
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-zinc-500">
                        Share: {c.shareNumerator as number}/
                        {totalContributions || 1}
                      </div>
                      {isMyContribution && (
                        <button
                          onClick={() =>
                            void handleRevoke(c.listingId as string)
                          }
                          disabled={revoking !== null}
                          className="px-3 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          {revoking === (c.listingId as string) ? (
                            <span className="inline-flex items-center gap-1">
                              Revoking <LoadingDots />
                            </span>
                          ) : (
                            "Revoke"
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Contribute to dataset - always visible for open datasets */}
        {type === "dataset" && (data.status as string) === "open" && (
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
            <h2 className="text-sm font-semibold text-zinc-200 mb-1">
              Contribute your data
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              Add one of your listings to this dataset. Revenue is split
              equally among all contributors when the dataset is purchased.
            </p>
            {contributeError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400 mb-4">
                {contributeError}
              </div>
            )}
            {myListings.length > 0 ? (
              <div className="space-y-2">
                {myListings.map((listing) => (
                  <div
                    key={listing.id}
                    className="flex items-center justify-between px-4 py-3 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-zinc-200 truncate">
                        {listing.title}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {CATEGORY_LABELS[listing.category] ?? listing.category}
                      </div>
                    </div>
                    <button
                      onClick={() => void handleContribute(listing.id)}
                      disabled={contributing !== null}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-50 shrink-0 inline-flex items-center gap-1"
                    >
                      {contributing === listing.id ? (
                        <>
                          Adding <LoadingDots />
                        </>
                      ) : (
                        "Add"
                      )}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-4 text-center">
                <p className="text-sm text-zinc-500 mb-2">
                  You need an active listing to contribute.
                </p>
                <Link
                  href="/upload"
                  className="text-sm text-emerald-400 hover:text-emerald-300 font-medium"
                >
                  Upload data & create a listing →
                </Link>
              </div>
            )}
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
              Purchase complete!
            </div>
            <div className="text-xs text-zinc-400">
              Your purchase has been confirmed. Access your data from the
              dashboard.
            </div>
            {purchaseTx && (
              <a
                href={txUrl(purchaseTx)}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-xs text-emerald-400 underline hover:text-emerald-300"
              >
                View settlement on MonadVision
              </a>
            )}
          </div>
        ) : isOwner && type === "listing" ? (
          <div className="text-center text-xs text-zinc-500 py-2">
            This is your listing. You already own this data.
          </div>
        ) : type === "dataset" && totalContributions === 0 ? (
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-4 text-center">
            <div className="text-sm text-zinc-400">
              This dataset has no contributions yet and cannot be purchased.
            </div>
            <div className="text-xs text-zinc-600 mt-1">
              Contribute your data to help build this dataset.
            </div>
          </div>
        ) : (
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
        )}

        {!purchased && USDC_HAS_FAUCET && <UsdcFaucetButton />}

        {isOwner && (
          <button
            onClick={() => void handleDelete()}
            disabled={deleteLoading}
            className="w-full py-2.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {deleteLoading ? (
              <span className="inline-flex items-center gap-2">
                Deleting <LoadingDots />
              </span>
            ) : (
              `Delete ${type === "dataset" ? "Dataset" : "Listing"}`
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function ProvenancePanel({
  contentHash,
  version,
  txHash,
  type,
}: {
  contentHash: string | null;
  version: number | null;
  txHash: string | null;
  type: string;
}) {
  return (
    <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-4 py-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">
          Onchain provenance
        </h2>
        <a
          href={addressUrl(MARKETPLACE_ADDRESS)}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-violet-300 hover:underline"
        >
          Monad contract
        </a>
      </div>
      {contentHash && txHash ? (
        <>
          <p className="text-xs text-zinc-400">
            {type === "dataset"
              ? "A commitment to every contributor's files and the payout split is anchored on Monad. Revenue is divided by the contract at purchase."
              : "A fingerprint of these files and the owner's payout address is anchored on Monad. Payment goes to the contract, never to Kyral."}
          </p>
          <div className="font-mono text-[11px] text-zinc-500 break-all">
            {contentHash}
          </div>
          <a
            href={txUrl(txHash)}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-xs text-violet-300 hover:underline"
          >
            Version {version ?? 1} anchor transaction
          </a>
        </>
      ) : (
        <p className="text-xs text-zinc-500">
          Not anchored yet. It will be registered on Monad when it becomes
          purchasable.
        </p>
      )}
    </div>
  );
}

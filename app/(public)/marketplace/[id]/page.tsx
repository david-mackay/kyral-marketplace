"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAppKitAccount } from "@reown/appkit/react";
import type { Address } from "viem";
import { useConfig } from "wagmi";

import { UsdcFaucetButton } from "@/components/UsdcFaucetButton";
import { Money, Sheet, SkeletonRows, VerifyLink, formatSpan } from "@/components/ui";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import { MARKETPLACE_ADDRESS, USDC_HAS_FAUCET } from "@/lib/chain";
import type { ColumnProfile } from "@/lib/data-profile";
import { CATEGORY_LABELS, formatDate } from "@/lib/format";
import { payForItem } from "@/lib/purchase";

interface DataProfileSummary {
  documentTypes: string[];
  files: number;
  rowCount: number;
  dateRange: { start: string; end: string } | null;
  spanDays: number;
  columns: ColumnProfile[];
  tags: string[];
  removedIdentifiers: string[];
  suitableFor: string[];
}

interface Detail {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priceUsdc: number;
  status: string;
  createdAt: string;
  ownerUserId?: string;
  creatorUserId?: string;
  ownerName?: string | null;
  creatorName?: string | null;
  totalContributions?: number;
  onchainContentHash: string | null;
  onchainVersion: number | null;
  onchainTxHash: string | null;
  dataProfile: DataProfileSummary | null;
}

interface Contribution {
  id: string;
  contributorUserId: string;
  contributorName: string | null;
  listingId: string;
  listingTitle: string | null;
}

function friendlyError(error: unknown) {
  const msg = (error as { shortMessage?: string }).shortMessage ?? (error instanceof Error ? error.message : "");
  if (/reject|denied/i.test(msg)) return "You cancelled the payment.";
  if (/Not enough USDC/i.test(msg)) return "Not enough funds in your account for this purchase.";
  if (/insufficient funds/i.test(msg)) return "Your account needs a little MON for network fees.";
  return msg || "Purchase failed";
}

export default function MarketplaceDetailPage() {
  const router = useRouter();
  const id = useParams().id as string;
  const type = useSearchParams().get("type") === "dataset" ? "dataset" : "listing";
  const { user, isAuthenticated } = useWalletAuth();
  const { address, isConnected } = useAppKitAccount();
  const wagmiConfig = useConfig();

  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [myListings, setMyListings] = useState<{ id: string; title: string }[]>([]);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseTx, setPurchaseTx] = useState<string | null>(null);
  const [busyListing, setBusyListing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await fetch(type === "dataset" ? `/api/datasets/${id}` : `/api/listings/${id}`, { cache: "no-store" }).then((r) => r.json());
      const detail = (type === "dataset" ? json.dataset : json.listing) as Detail | undefined;
      setData(detail ?? null);
      const contribs = (json.contributions ?? []) as Contribution[];
      setContributions(type === "dataset" ? contribs : []);

      if (type === "dataset" && isAuthenticated) {
        const mine = await fetch("/api/listings?mine=true", { cache: "no-store" }).then((r) => r.json());
        const already = new Set(contribs.map((c) => c.listingId));
        setMyListings(
          (mine.listings ?? []).filter((l: { id: string; status: string }) => l.status === "active" && !already.has(l.id))
        );
      }
    } finally {
      setLoading(false);
    }
  }, [id, type, isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const purchase = useCallback(async () => {
    if (!isConnected || !address) return;
    setPurchasing(true);
    setPurchaseError(null);
    try {
      const initRes = await fetch("/api/purchases/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: type, targetId: id }),
      });
      const init = await initRes.json();
      if (!initRes.ok) throw new Error(init.error || "Couldn't start the purchase");
      const { purchase: order, ...quote } = init;

      const txHash = await payForItem(wagmiConfig, address as Address, quote);

      const confirmRes = await fetch("/api/purchases/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseId: order.id, txHash }),
      });
      if (!confirmRes.ok) throw new Error((await confirmRes.json()).error || "Couldn't confirm the purchase");
      setPurchaseTx(txHash);
    } catch (error) {
      setPurchaseError(friendlyError(error));
    } finally {
      setPurchasing(false);
    }
  }, [address, id, isConnected, type, wagmiConfig]);

  const contribute = async (listingId: string, method: "POST" | "DELETE") => {
    if (method === "DELETE" && !confirm("Leave this dataset? You'll stop earning from future purchases.")) return;
    setBusyListing(listingId);
    try {
      await fetch(`/api/datasets/${id}/contribute`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      await load();
    } finally {
      setBusyListing(null);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete this ${type}? This can't be undone.`)) return;
    const res = await fetch(type === "dataset" ? `/api/datasets/${id}` : `/api/listings/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/earn");
    else alert((await res.json()).error ?? "Couldn't delete");
  };

  if (loading && !data) return <SkeletonRows rows={5} />;
  if (!data) {
    return (
      <div className="glass px-8 py-16 text-center">
        <div className="text-zinc-400">Not found.</div>
        <Link href="/marketplace" className="mt-4 inline-block text-sm text-emerald-300">Back to marketplace</Link>
      </div>
    );
  }

  const isOwner = !!user && user.id === (data.ownerUserId ?? data.creatorUserId);
  const p = data.dataProfile;
  const contributorCount = data.totalContributions ?? 0;

  return (
    <div className="space-y-6">
      <Link href="/marketplace" className="text-sm text-zinc-500 hover:text-zinc-300">← Marketplace</Link>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <section className="pt-2">
            <div className="flex flex-wrap gap-1.5 mb-4">
              <span className="chip">{CATEGORY_LABELS[data.category] ?? data.category}</span>
              {type === "dataset" && <span className="chip !text-sky-200">Pooled dataset</span>}
              {p?.documentTypes.map((t) => <span key={t} className="chip !text-zinc-400">{t}</span>)}
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-50">{data.title}</h1>
            {data.description && <p className="mt-4 text-zinc-400 leading-relaxed whitespace-pre-wrap">{data.description}</p>}
          </section>

          {p ? (
            <Sheet title="What you get">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-6">
                <Stat label="Records" value={p.rowCount.toLocaleString()} />
                <Stat label="History" value={p.spanDays ? formatSpan(p.spanDays) : "—"} />
                <Stat label={type === "dataset" ? "People" : "Files"} value={String(type === "dataset" ? contributorCount : p.files)} />
                <Stat label="Fields" value={String(p.columns.length)} />
              </div>
              {p.columns.length > 0 && (
                <div className="hairline border-t pt-4">
                  <div className="eyebrow mb-3">Fields</div>
                  <ul className="divide-hairline text-sm">
                    {p.columns.map((c) => (
                      <li key={c.name} className="flex items-center justify-between gap-4 py-2">
                        <span className="font-mono text-[13px] text-zinc-300 truncate">{c.name}</span>
                        <span className="text-xs text-zinc-500 shrink-0 tabular-nums">
                          {c.type === "number" && c.min !== undefined
                            ? `${c.min} – ${c.max}${c.unit ? ` ${c.unit}` : ""}`
                            : c.type}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(p.removedIdentifiers.length > 0 || p.suitableFor.length > 0) && (
                <div className="hairline border-t pt-4 mt-4 grid sm:grid-cols-2 gap-4 text-xs text-zinc-400">
                  {p.suitableFor.length > 0 && (
                    <div>
                      <div className="eyebrow mb-2">Good for</div>
                      {p.suitableFor.join(" · ")}
                    </div>
                  )}
                  <div>
                    <div className="eyebrow mb-2">Privacy</div>
                    Dates shifted per person.{" "}
                    {p.removedIdentifiers.length ? `Removed ${p.removedIdentifiers.join(", ")}.` : "No direct identifiers found."}
                  </div>
                </div>
              )}
            </Sheet>
          ) : (
            <Sheet>
              <p className="text-sm text-zinc-500">
                {type === "dataset" && contributorCount === 0
                  ? "No one has contributed yet."
                  : "A detailed preview isn't available for this data."}
              </p>
            </Sheet>
          )}

          {type === "dataset" && (contributions.length > 0 || (isAuthenticated && data.status === "open")) && (
            <Sheet title="Contributors">
              {contributions.length > 0 && (
                <ul className="divide-hairline -my-2 mb-2">
                  {contributions.map((c, i) => (
                    <li key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-zinc-300">
                        {c.contributorUserId === user?.id ? "You" : c.contributorName ?? `Contributor ${i + 1}`}
                      </span>
                      {c.contributorUserId === user?.id && (
                        <button
                          onClick={() => void contribute(c.listingId, "DELETE")}
                          disabled={busyListing !== null}
                          className="text-xs text-zinc-500 hover:text-red-300"
                        >
                          Leave
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {isAuthenticated && data.status === "open" && (
                <div className="hairline border-t pt-4 mt-2">
                  <div className="text-xs text-zinc-500 mb-3">Add your data. Revenue is split equally between contributors.</div>
                  {myListings.length ? (
                    <div className="flex flex-wrap gap-2">
                      {myListings.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => void contribute(l.id, "POST")}
                          disabled={busyListing !== null}
                          className="btn-ghost !py-1.5 !text-xs"
                        >
                          + {l.title}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Link href="/upload" className="text-sm text-emerald-300 hover:underline">Add data to contribute →</Link>
                  )}
                </div>
              )}
            </Sheet>
          )}
        </div>

        {/* Buy panel */}
        <aside className="glass p-6 sm:p-7 lg:sticky lg:top-24 space-y-5">
          <div>
            <div className="eyebrow mb-2">Access</div>
            <Money usdc={data.priceUsdc} className="num-display text-5xl" />
            <div className="mt-2 text-xs text-zinc-500">
              {type === "dataset"
                ? `Split instantly between ${contributorCount} contributor${contributorCount === 1 ? "" : "s"}`
                : "Paid instantly to the person who shared it"}
            </div>
          </div>

          {purchaseTx ? (
            <div className="space-y-3">
              <div className="text-emerald-300 text-sm">Purchased. It&apos;s in your library.</div>
              <div className="flex items-center gap-3">
                <Link href="/purchases" className="btn-liquid !py-2">Open library</Link>
                <VerifyLink txHash={purchaseTx} />
              </div>
            </div>
          ) : isOwner && type === "listing" ? (
            <div className="text-sm text-zinc-500">This is your data.</div>
          ) : type === "dataset" && contributorCount === 0 ? (
            <div className="text-sm text-zinc-500">Available once someone contributes.</div>
          ) : !isAuthenticated ? (
            <Link href={`/auth?next=${encodeURIComponent(`/marketplace/${id}?type=${type}`)}`} className="btn-liquid w-full">Sign in to buy</Link>
          ) : (
            <button onClick={() => void purchase()} disabled={purchasing} className="btn-liquid w-full">
              {purchasing ? "Processing…" : "Buy access"}
            </button>
          )}

          {purchaseError && <div className="text-sm text-red-300">{purchaseError}</div>}
          {isAuthenticated && !purchaseTx && USDC_HAS_FAUCET && <UsdcFaucetButton />}

          <div className="hairline border-t pt-4 text-[11px] text-zinc-500 space-y-1.5">
            <div>Listed {formatDate(data.createdAt)}</div>
            {data.onchainTxHash ? (
              <div className="flex items-center gap-2">
                <span>Fingerprint & payout split recorded publicly</span>
                <VerifyLink txHash={data.onchainTxHash} />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span>Payments settle on Monad</span>
                <VerifyLink address={MARKETPLACE_ADDRESS} />
              </div>
            )}
          </div>

          {isOwner && (
            <button onClick={() => void remove()} className="text-xs text-zinc-600 hover:text-red-300">
              Delete {type}
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xl font-light text-zinc-50 tabular-nums">{value}</div>
      <div className="text-[11px] text-zinc-500 mt-1">{label}</div>
    </div>
  );
}

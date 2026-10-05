"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Money, ProgressBar, PurposeChip, SkeletonRows, timeAgo } from "@/components/ui";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import { criteriaChips, type BountyRow } from "@/lib/bounties";

export default function RequestsPage() {
  const { isAuthenticated } = useWalletAuth();
  const [rows, setRows] = useState<BountyRow[] | null>(null);
  const [mine, setMine] = useState<BountyRow[]>([]);

  useEffect(() => {
    void fetch("/api/bounties", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRows(d.bounties ?? []));
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void fetch("/api/bounties?mine=true", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMine((d.bounties ?? []).filter((b: BountyRow) => b.status !== "closed")));
  }, [isAuthenticated]);

  const open = rows?.filter((r) => r.status === "open") ?? [];
  const filled = rows?.filter((r) => r.status === "filled") ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-zinc-50">Data requests</h1>
          <p className="mt-3 text-zinc-400 max-w-xl">
            Researchers post what they need and escrow the reward. Matching data is de-identified, delivered, and
            paid for automatically, only if the owner consented to that kind of research.
          </p>
        </div>
        <Link href="/requests/new" className="btn-liquid shrink-0">Post a request</Link>
      </div>

      {mine.length > 0 && (
        <div className="space-y-3">
          <div className="eyebrow px-1">Your requests</div>
          <RequestList rows={mine} />
        </div>
      )}

      {rows === null ? (
        <SkeletonRows rows={5} />
      ) : open.length === 0 && filled.length === 0 ? (
        <div className="glass px-8 py-16 text-center text-sm text-zinc-500">
          No requests yet. <Link href="/requests/new" className="text-emerald-300">Post the first one.</Link>
        </div>
      ) : (
        <>
          {open.length > 0 && <RequestList rows={open} />}
          {filled.length > 0 && (
            <div className="space-y-3">
              <div className="eyebrow px-1">Recently filled</div>
              <RequestList rows={filled} muted />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RequestList({ rows, muted = false }: { rows: BountyRow[]; muted?: boolean }) {
  return (
    <ul className={`glass divide-hairline px-6 sm:px-8 ${muted ? "opacity-70" : ""}`}>
      {rows.map((b) => (
        <li key={b.id}>
          <Link href={`/requests/${b.id}`} className="group flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8 py-6">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-zinc-500 mb-1">
                {b.organization ?? "Independent researcher"} · {timeAgo(b.createdAt)}
                {b.status === "awaiting_funding" && <span className="text-amber-300"> · Draft, not funded</span>}
              </div>
              <div className="text-[15px] text-zinc-100 group-hover:text-white">{b.title}</div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                <PurposeChip purpose={b.purpose} />
                {criteriaChips(b.criteria).slice(0, 5).map((c) => (
                  <span key={c} className="chip !text-zinc-400">{c}</span>
                ))}
              </div>
            </div>
            <div className="sm:w-44 shrink-0 sm:text-right">
              <Money usdc={b.rewardUsdc} className="text-2xl font-light text-zinc-50" />
              <div className="text-[11px] text-zinc-500 mb-2">per person</div>
              <ProgressBar value={b.filledCount} max={b.maxContributors} />
              <div className="text-[11px] text-zinc-500 mt-1.5 tabular-nums">
                {b.filledCount} of {b.maxContributors} filled
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

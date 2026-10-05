"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Money, ProgressBar, PurposeChip, Sheet, SkeletonRows, VerifyLink, formatSpan, timeAgo } from "@/components/ui";
import { PURPOSE_LABELS } from "@/lib/data-profile";
import { formatUsdc } from "@/lib/format";
import { criteriaChips, type BountyRow } from "@/lib/bounties";

interface Contribution {
  label: string;
  documentType: string;
  rowCount: number;
  spanDays: number;
  dataHash: string | null;
  txHash: string | null;
  createdAt: string;
}

interface Detail {
  bounty: BountyRow;
  isCreator: boolean;
  contributions: Contribution[];
  myFill: { rewardUsdc: number; txHash: string | null; createdAt: string } | null;
}

const STATUS_LABEL: Record<BountyRow["status"], string> = {
  awaiting_funding: "Waiting for funding",
  open: "Open",
  filled: "Filled",
  closed: "Closed",
};

export default function RequestDetailPage() {
  const id = useParams().id as string;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/bounties/${id}`, { cache: "no-store" });
    if (!res.ok) return setMissing(true);
    setDetail(await res.json());
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const close = async () => {
    if (!confirm("Close this request? Unused funds will be returned to you.")) return;
    setClosing(true);
    setError(null);
    try {
      const res = await fetch(`/api/bounties/${id}/close`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't close");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't close");
    } finally {
      setClosing(false);
    }
  };

  if (missing) {
    return (
      <div className="glass px-8 py-16 text-center">
        <div className="text-zinc-400">Request not found.</div>
        <Link href="/requests" className="mt-4 inline-block text-sm text-emerald-300">All requests</Link>
      </div>
    );
  }
  if (!detail) return <SkeletonRows rows={4} />;

  const { bounty: b, isCreator, contributions, myFill } = detail;
  const remaining = b.maxContributors - b.filledCount;

  return (
    <div className="space-y-6">
      <Link href="/requests" className="text-sm text-zinc-500 hover:text-zinc-300">← Requests</Link>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <section className="pt-2">
            <div className="text-sm text-zinc-500 mb-2">
              {b.organization ?? "Independent researcher"} · posted {timeAgo(b.createdAt)}
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-50">{b.title}</h1>
            {b.description && <p className="mt-4 text-zinc-400 leading-relaxed whitespace-pre-wrap">{b.description}</p>}
          </section>

          <Sheet title="Looking for">
            <div className="flex flex-wrap gap-1.5">
              {criteriaChips(b.criteria).map((c) => (
                <span key={c} className="chip">{c}</span>
              ))}
              {criteriaChips(b.criteria).length === 0 && <span className="text-sm text-zinc-500">Any health data</span>}
            </div>
            <p className="mt-5 text-xs text-zinc-500 leading-relaxed">
              Only people who allow <span className="text-zinc-300">{PURPOSE_LABELS[b.purpose as keyof typeof PURPOSE_LABELS] ?? b.purpose}</span>{" "}
              use are matched. Data arrives de-identified with dates shifted. The researcher never learns who contributed.
            </p>
          </Sheet>

          {isCreator && (
            <Sheet
              title={`Contributions (${contributions.length})`}
              action={
                contributions.length > 0 && (
                  <a href={`/api/bounties/${id}/download`} className="btn-ghost btn-sm">Download all</a>
                )
              }
            >
              {contributions.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  {b.status === "awaiting_funding"
                    ? "Fund the request to start matching."
                    : "We'll match new data as people upload it. You'll get a notification for each one."}
                </p>
              ) : (
                <ul className="divide-hairline -my-2">
                  {contributions.map((c) => (
                    <li key={c.label} className="flex items-center justify-between gap-4 py-3 text-sm">
                      <div className="min-w-0">
                        <div className="text-zinc-200">{c.label}</div>
                        <div className="text-xs text-zinc-500">
                          {c.documentType} · {c.rowCount} records{c.spanDays ? ` · ${formatSpan(c.spanDays)}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-xs text-zinc-500">
                        {timeAgo(c.createdAt)}
                        <VerifyLink txHash={c.txHash} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Sheet>
          )}
        </div>

        <aside className="glass p-6 sm:p-7 lg:sticky lg:top-24 space-y-5">
          <div>
            <div className="eyebrow mb-2">Reward per person</div>
            <Money usdc={b.rewardUsdc} className="num-display text-5xl" />
          </div>

          <div>
            <ProgressBar value={b.filledCount} max={b.maxContributors} />
            <div className="flex justify-between text-xs text-zinc-500 mt-2 tabular-nums">
              <span>{b.filledCount} of {b.maxContributors} filled</span>
              <span>{STATUS_LABEL[b.status]}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <PurposeChip purpose={b.purpose} />
          </div>

          {myFill ? (
            <div className="hairline border-t pt-4">
              <div className="text-sm text-emerald-300">Your data is in this study</div>
              <div className="text-xs text-zinc-500 mt-1 flex items-center gap-2">
                You earned {formatUsdc(myFill.rewardUsdc)} · {timeAgo(myFill.createdAt)}
                <VerifyLink txHash={myFill.txHash} />
              </div>
            </div>
          ) : !isCreator && b.status === "open" ? (
            <div className="hairline border-t pt-4 space-y-3">
              <p className="text-xs text-zinc-500">
                Have matching data? Add it and you&apos;ll be paid {formatUsdc(b.rewardUsdc)} automatically if it qualifies.
              </p>
              <Link href="/upload" className="btn-liquid w-full">Add my data</Link>
            </div>
          ) : null}

          {isCreator && (
            <div className="hairline border-t pt-4 space-y-3 text-xs text-zinc-500">
              {b.status === "open" && (
                <>
                  <div>{formatUsdc(remaining * b.rewardUsdc)} still held for {remaining} more contributor{remaining === 1 ? "" : "s"}.</div>
                  <button onClick={() => void close()} disabled={closing} className="btn-ghost w-full">
                    {closing ? "Closing…" : "Close & refund the rest"}
                  </button>
                </>
              )}
              {b.status === "awaiting_funding" && (
                <button onClick={() => void close()} disabled={closing} className="btn-ghost w-full">Discard draft</button>
              )}
              {error && <div className="text-red-300">{error}</div>}
            </div>
          )}

          {b.fundingTxHash && (
            <div className="hairline border-t pt-4 flex items-center justify-between text-[11px] text-zinc-500">
              <span>Rewards held in escrow</span>
              <VerifyLink txHash={b.fundingTxHash} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

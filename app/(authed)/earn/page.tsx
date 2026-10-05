"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Money, PurposeChip, Sheet, SkeletonRows, VerifyLink, formatSpan, timeAgo } from "@/components/ui";
import { CONSENT_PURPOSES, PURPOSE_LABELS, type ConsentPurpose, type DataProfile } from "@/lib/data-profile";
import { formatUsdc } from "@/lib/format";

interface EarnData {
  availableUsdc: number;
  lifetimeUsdc: number;
  settings: { consentPurposes: ConsentPurpose[]; autoFill: boolean };
  data: {
    id: string;
    fileName: string;
    status: string;
    profile: DataProfile | null;
    shareable: boolean;
    createdAt: string;
    listing: { id: string; priceUsdc: number; status: string } | null;
    requestsJoined: number;
  }[];
  participation: {
    bountyId: string;
    title: string;
    organization: string | null;
    purpose: string;
    rewardUsdc: number;
    txHash: string | null;
    createdAt: string;
  }[];
  lockedOpportunities: { id: string; title: string; organization: string | null; purpose: string; rewardUsdc: number }[];
}

interface ActivityEvent {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  amountUsdc: number | null;
  href: string | null;
  txHash: string | null;
  createdAt: string;
}

const KIND_DOT: Record<string, string> = {
  bounty_filled: "bg-emerald-400",
  sale: "bg-emerald-400",
  withdrawal: "bg-sky-400",
  listed: "bg-violet-400",
  data_ready: "bg-zinc-400",
};

export default function EarnPage() {
  const [data, setData] = useState<EarnData | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [withdrawing, setWithdrawing] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);

  const load = useCallback(async () => {
    const [earnRes, activityRes] = await Promise.all([
      fetch("/api/earn", { cache: "no-store" }),
      fetch("/api/activity", { cache: "no-store" }),
    ]);
    if (earnRes.ok) setData(await earnRes.json());
    if (activityRes.ok) setActivity((await activityRes.json()).events ?? []);
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 15_000);
    return () => clearInterval(interval);
  }, [load]);

  const withdraw = async () => {
    setWithdrawing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/withdrawals", { method: "POST" });
      const body = await res.json();
      setNotice(
        res.ok
          ? { ok: true, text: `${formatUsdc(body.amountUsdc)} is on its way to your account.` }
          : { ok: false, text: body.error ?? "Withdrawal failed" }
      );
      await load();
    } finally {
      setWithdrawing(false);
    }
  };

  const updateSettings = async (patch: Partial<EarnData["settings"]>) => {
    if (!data) return;
    setSavingConsent(true);
    setData({ ...data, settings: { ...data.settings, ...patch } });
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (body.requestsFilled > 0) {
        setNotice({ ok: true, text: `Your data just joined ${body.requestsFilled} more request${body.requestsFilled > 1 ? "s" : ""}.` });
      }
      await load();
    } finally {
      setSavingConsent(false);
    }
  };

  const togglePurpose = (purpose: ConsentPurpose) => {
    if (!data) return;
    const current = data.settings.consentPurposes;
    void updateSettings({
      consentPurposes: current.includes(purpose) ? current.filter((p) => p !== purpose) : [...current, purpose],
    });
  };

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-48 rounded-[28px]" />
        <SkeletonRows rows={4} />
      </div>
    );
  }

  const lockedTotal = data.lockedOpportunities.reduce((s, o) => s + o.rewardUsdc, 0);
  const lockedPurposes = [...new Set(data.lockedOpportunities.map((o) => o.purpose))] as ConsentPurpose[];

  return (
    <div className="space-y-8">
      {/* Earnings hero */}
      <section className="pt-4 pb-2">
        <div className="eyebrow mb-4">Available to withdraw</div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-6 sm:gap-10">
          <div className="num-display text-7xl sm:text-8xl lg:text-9xl">
            <Money usdc={data.availableUsdc} />
          </div>
          <div className="flex items-center gap-3 pb-2">
            <button onClick={() => void withdraw()} disabled={withdrawing || data.availableUsdc === 0} className="btn-liquid">
              {withdrawing ? "Sending…" : "Withdraw"}
            </button>
            <Link href="/upload" className="btn-ghost">Add more data</Link>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-sm text-zinc-400">
          <span>
            <Money usdc={data.lifetimeUsdc} className="text-zinc-100" /> earned all time
          </span>
          <span>
            <span className="text-zinc-100">{data.participation.length}</span> studies joined
          </span>
          <span>
            <span className="text-zinc-100">{data.data.filter((d) => d.shareable).length}</span> files earning
          </span>
        </div>
        {notice && (
          <div className={`mt-5 text-sm ${notice.ok ? "text-emerald-300" : "text-red-400"}`}>{notice.text}</div>
        )}
      </section>

      {lockedTotal > 0 && (
        <div className="glass px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm text-zinc-300">
            Your data fits <span className="text-zinc-50">{data.lockedOpportunities.length}</span> more request
            {data.lockedOpportunities.length > 1 ? "s" : ""} worth{" "}
            <Money usdc={lockedTotal} className="text-emerald-300" />, from{" "}
            {lockedPurposes.map((p) => PURPOSE_LABELS[p].toLowerCase()).join(" and ")}.
          </div>
          <button
            onClick={() => void updateSettings({ consentPurposes: [...new Set([...data.settings.consentPurposes, ...lockedPurposes])] })}
            className="btn-ghost shrink-0"
            disabled={savingConsent}
          >
            Allow & earn
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Activity */}
        <Sheet title="Where your data has been" className="lg:col-span-3">
          {activity.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Nothing yet. <Link href="/upload" className="text-emerald-300 hover:underline">Add a file</Link> and
              we&apos;ll start matching it to research requests.
            </p>
          ) : (
            <ul className="divide-hairline -my-3">
              {activity.map((e) => (
                <li key={e.id} className="flex items-start gap-3 py-3.5">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND_DOT[e.kind] ?? "bg-zinc-500"}`} />
                  <div className="min-w-0 flex-1">
                    {e.href ? (
                      <Link href={e.href} className="text-sm text-zinc-100 hover:text-white">{e.title}</Link>
                    ) : (
                      <div className="text-sm text-zinc-100">{e.title}</div>
                    )}
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
                      {e.detail && <span className="truncate">{e.detail}</span>}
                      <span className="shrink-0">· {timeAgo(e.createdAt)}</span>
                      <VerifyLink txHash={e.txHash} />
                    </div>
                  </div>
                  {e.amountUsdc && e.kind !== "withdrawal" ? (
                    <Money usdc={e.amountUsdc} className="text-sm text-emerald-300 shrink-0" />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Sheet>

        {/* Privacy */}
        <Sheet title="Who can use your data" className="lg:col-span-2">
          <div className="space-y-2">
            {CONSENT_PURPOSES.map((p) => {
              const on = data.settings.consentPurposes.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => togglePurpose(p)}
                  disabled={savingConsent}
                  className="w-full flex items-center justify-between rounded-2xl px-4 py-3 text-sm hover:bg-white/5 transition-colors"
                >
                  <span className={on ? "text-zinc-100" : "text-zinc-500"}>{PURPOSE_LABELS[p]}</span>
                  <Toggle on={on} />
                </button>
              );
            })}
          </div>
          <div className="hairline border-t mt-4 pt-4">
            <button
              onClick={() => void updateSettings({ autoFill: !data.settings.autoFill })}
              disabled={savingConsent}
              className="w-full flex items-center justify-between rounded-2xl px-4 py-3 text-sm hover:bg-white/5"
            >
              <span className="text-left">
                <span className="block text-zinc-100">Sell for me automatically</span>
                <span className="block text-xs text-zinc-500 mt-0.5">List new files and join matching studies</span>
              </span>
              <Toggle on={data.settings.autoFill} />
            </button>
          </div>
          <p className="text-xs text-zinc-500 mt-4 leading-relaxed">
            Researchers only ever receive de-identified copies. Names, contact details, record numbers and exact
            dates are removed before anything leaves Kyral.
          </p>
        </Sheet>
      </div>

      {/* Your data */}
      <Sheet
        title="Your data"
        action={<Link href="/upload" className="text-xs text-emerald-300 hover:underline">Add data</Link>}
      >
        {data.data.length === 0 ? (
          <p className="text-sm text-zinc-500">No files yet.</p>
        ) : (
          <ul className="divide-hairline -my-4">
            {data.data.map((d) => (
              <DataRow key={d.id} row={d} onChanged={load} />
            ))}
          </ul>
        )}
      </Sheet>

      {data.participation.length > 0 && (
        <Sheet title="Studies you're part of">
          <ul className="divide-hairline -my-3">
            {data.participation.map((p) => (
              <li key={p.bountyId} className="flex items-center gap-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <Link href={`/requests/${p.bountyId}`} className="text-sm text-zinc-100 hover:text-white">{p.title}</Link>
                  <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                    <span>{p.organization ?? "Research team"}</span>
                    <PurposeChip purpose={p.purpose} />
                    <VerifyLink txHash={p.txHash} />
                  </div>
                </div>
                <Money usdc={p.rewardUsdc} className="text-sm text-emerald-300" />
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors ${
        on ? "bg-emerald-500/80" : "bg-white/10"
      } shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.35)] transition-transform ${
          on ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </span>
  );
}

function DataRow({ row, onChanged }: { row: EarnData["data"][number]; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(row.listing ? (row.listing.priceUsdc / 1e6).toFixed(2) : "");
  const p = row.profile;

  const savePrice = async () => {
    if (!row.listing) return;
    const value = Math.round(parseFloat(price) * 1e6);
    if (!value || value <= 0) return;
    await fetch(`/api/listings/${row.listing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceUsdc: value }),
    });
    setEditing(false);
    await onChanged();
  };

  const toggleListing = async () => {
    if (!row.listing) return;
    await fetch(`/api/listings/${row.listing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: row.listing.status === "active" ? "paused" : "active" }),
    });
    await onChanged();
  };

  return (
    <li className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-zinc-100">{p?.documentType ?? row.fileName}</div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {p && p.rowCount > 0 && <span className="chip">{p.rowCount} records</span>}
          {p && p.spanDays > 0 && <span className="chip">{formatSpan(p.spanDays)}</span>}
          {row.shareable ? (
            <span className="chip text-emerald-200">
              {p?.removedIdentifiers.length ? `Removed ${p.removedIdentifiers.length} identifier types` : "No identifiers found"}
            </span>
          ) : (
            <span className="chip text-amber-200">{row.status === "error" ? "Couldn't read this file" : "Private only"}</span>
          )}
          {row.requestsJoined > 0 && <span className="chip">In {row.requestsJoined} studies</span>}
        </div>
      </div>
      {row.listing && (
        <div className="flex items-center gap-3 shrink-0">
          {editing ? (
            <>
              <input
                className="field !w-24 !py-1.5"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                autoFocus
              />
              <button className="btn-ghost !py-1.5 !px-3 !text-xs" onClick={() => void savePrice()}>Save</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="text-right" title="Change price">
              <Money usdc={row.listing.priceUsdc} className="text-sm text-zinc-100" />
              <div className="text-[11px] text-zinc-500">{row.listing.status === "active" ? "per buyer" : "paused"}</div>
            </button>
          )}
          <button onClick={() => void toggleListing()} className="text-[11px] text-zinc-500 hover:text-zinc-200">
            {row.listing.status === "active" ? "Pause" : "Resume"}
          </button>
        </div>
      )}
    </li>
  );
}

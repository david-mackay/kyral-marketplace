"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Money, SkeletonRows, formatSpan } from "@/components/ui";
import { CATEGORY_LABELS, DATA_CATEGORIES } from "@/lib/format";

type Summary = {
  rowCount: number;
  spanDays: number;
  tags: string[];
  documentTypes: string[];
} | null;

type Row = {
  key: string;
  href: string;
  kind: "listing" | "dataset";
  title: string;
  description: string | null;
  category: string;
  priceUsdc: number;
  createdAt: string;
  contributors?: number;
  dataProfile?: Summary;
};

type Tab = "all" | "listing" | "dataset";

export default function MarketplacePage() {
  const [tab, setTab] = useState<Tab>("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    if (query) params.set("search", query);
    const qs = params.size ? `?${params}` : "";

    void (async () => {
      const [l, d] = await Promise.all([
        tab !== "dataset" ? fetch(`/api/listings${qs}`).then((r) => r.json()) : { listings: [] },
        tab !== "listing" ? fetch(`/api/datasets${qs}`).then((r) => r.json()) : { datasets: [] },
      ]);
      if (cancelled) return;
      setRows([
        ...(d.datasets ?? []).map((x: Record<string, unknown>) => ({
          key: `d-${x.id}`,
          href: `/marketplace/${x.id}?type=dataset`,
          kind: "dataset" as const,
          title: x.title as string,
          description: x.description as string | null,
          category: x.category as string,
          priceUsdc: x.priceUsdc as number,
          createdAt: x.createdAt as string,
          contributors: x.totalContributions as number,
        })),
        ...(l.listings ?? []).map((x: Record<string, unknown>) => ({
          key: `l-${x.id}`,
          href: `/marketplace/${x.id}?type=listing`,
          kind: "listing" as const,
          title: x.title as string,
          description: x.description as string | null,
          category: x.category as string,
          priceUsdc: x.priceUsdc as number,
          createdAt: x.createdAt as string,
          dataProfile: x.dataProfile as Summary,
        })),
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, category, query]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-zinc-50">Marketplace</h1>
        <p className="mt-3 text-zinc-400 max-w-xl">
          Consented, de-identified health data from real people. Every purchase pays the people behind it.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="glass-pill flex p-1">
          {(["all", "listing", "dataset"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
                tab === t ? "bg-white/12 text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t === "all" ? "All" : t === "listing" ? "Individuals" : "Pooled datasets"}
            </button>
          ))}
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="field !w-auto !rounded-full">
          <option value="all">All categories</option>
          {DATA_CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <input
          className="field !rounded-full sm:max-w-sm"
          placeholder="Search HRV, HbA1c, long COVID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {rows === null ? (
        <SkeletonRows rows={6} />
      ) : rows.length === 0 ? (
        <div className="glass px-8 py-16 text-center text-sm text-zinc-500">Nothing matches yet.</div>
      ) : (
        <ul className="glass divide-hairline px-6 sm:px-8">
          {rows.map((r) => (
            <li key={r.key}>
              <Link href={r.href} className="group flex items-center gap-5 py-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] text-zinc-100 group-hover:text-white truncate">{r.title}</span>
                    {r.kind === "dataset" && <span className="chip !text-sky-200">Pooled</span>}
                  </div>
                  {r.description && <p className="mt-1 text-sm text-zinc-500 line-clamp-1">{r.description}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="chip">{CATEGORY_LABELS[r.category] ?? r.category}</span>
                    {r.dataProfile?.rowCount ? <span className="chip">{r.dataProfile.rowCount} records</span> : null}
                    {r.dataProfile?.spanDays ? <span className="chip">{formatSpan(r.dataProfile.spanDays)}</span> : null}
                    {r.contributors !== undefined && <span className="chip">{r.contributors} contributors</span>}
                    {r.dataProfile?.tags.slice(0, 3).map((t) => (
                      <span key={t} className="chip !text-zinc-400">{t}</span>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <Money usdc={r.priceUsdc} className="text-xl font-light text-zinc-50" />
                  <div className="text-[11px] text-zinc-500">access</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

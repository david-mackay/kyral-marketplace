import type { ReactNode } from "react";

import { addressUrl, txUrl } from "@/lib/chain";
import { PURPOSE_LABELS, type ConsentPurpose } from "@/lib/data-profile";

/** Dollar amount with de-emphasized cents. Amounts are USDC smallest units. */
export function Money({ usdc, decimals = 2, className = "" }: { usdc: number; decimals?: number; className?: string }) {
  const dollars = usdc / 1_000_000;
  const [whole, cents] = dollars.toFixed(decimals).split(".");
  return (
    <span className={`tabular-nums ${className}`}>
      ${Number(whole).toLocaleString("en-US")}
      <span className="opacity-50">.{cents}</span>
    </span>
  );
}

/** Small, quiet link to the public settlement record. */
export function VerifyLink({ txHash, address, label = "Verify" }: { txHash?: string | null; address?: string; label?: string }) {
  const href = txHash ? txUrl(txHash) : address ? addressUrl(address) : null;
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-0.5 text-[11px] text-zinc-500 hover:text-emerald-300 transition-colors"
      title="Public settlement record"
    >
      {label}
      <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor" aria-hidden>
        <path d="M11 3h6v6h-2V6.4l-6.3 6.3-1.4-1.4L13.6 5H11V3zM5 5h4v2H5v8h8v-4h2v6H3V5h2z" />
      </svg>
    </a>
  );
}

export function PurposeChip({ purpose }: { purpose: string }) {
  return <span className="chip">{PURPOSE_LABELS[purpose as ConsentPurpose] ?? purpose}</span>;
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-[width] duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Sheet({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass p-6 sm:p-8 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-4 mb-5">
          {title && <h2 className="text-sm font-medium text-zinc-300">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-14" />
      ))}
    </div>
  );
}

export function formatSpan(days: number) {
  if (days <= 1) return "single day";
  if (days < 60) return `${days} days`;
  if (days < 730) return `${Math.round(days / 30)} months`;
  return `${(days / 365).toFixed(1)} years`;
}

export function timeAgo(date: string | Date) {
  const s = Math.max(1, Math.round((Date.now() - new Date(date).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

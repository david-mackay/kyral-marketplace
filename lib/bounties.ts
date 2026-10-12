import { formatSpan } from "@/components/ui";
import type { BountyCriteria } from "@/lib/data-profile";
import { CATEGORY_LABELS } from "@/lib/format";
import { signalLabel } from "@/lib/signals";

export interface BountyRow {
  id: string;
  title: string;
  description: string | null;
  organization: string | null;
  purpose: string;
  criteria: BountyCriteria;
  rewardUsdc: number;
  maxContributors: number;
  filledCount: number;
  status: "awaiting_funding" | "open" | "filled" | "closed";
  fundingTxHash: string | null;
  ratePerSecondUsdc: number | null;
  rentalDurationSeconds: number | null;
  rentalEndsAt: string | null;
  createdAt: string;
}

type RentalFields = { ratePerSecondUsdc: number | null; rentalEndsAt: string | Date | null };

export function isRental(b: RentalFields) {
  return b.ratePerSecondUsdc != null;
}

/** A rental that has ended no longer takes contributors or grants access. */
export function rentalEnded(b: RentalFields, now = Date.now()) {
  return isRental(b) && (!b.rentalEndsAt || new Date(b.rentalEndsAt).getTime() <= now);
}

/** "$0.000278/sec": enough decimals to show sub-cent rates. */
export function formatRate(usdcPerSecond: number) {
  const dollars = usdcPerSecond / 1_000_000;
  return `$${dollars.toFixed(dollars < 0.01 ? 6 : 2)}/sec`;
}

export function formatDuration(seconds: number) {
  if (seconds >= 86_400) return `${+(seconds / 86_400).toFixed(1)} days`;
  if (seconds >= 3_600) return `${+(seconds / 3_600).toFixed(1)} hours`;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

/** "2d 4h 13m 05s" */
export function formatCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1_000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const parts = [d && `${d}d`, (d || h) && `${h}h`, `${m}m`, `${String(s % 60).padStart(2, "0")}s`];
  return parts.filter(Boolean).join(" ");
}

export function criteriaChips(c: BountyCriteria) {
  return [
    ...c.categories.map((x) => CATEGORY_LABELS[x] ?? x),
    ...c.requiredSignals.map(signalLabel),
    ...(c.minSpanDays ? [`${formatSpan(c.minSpanDays)}+ history`] : []),
    ...(c.minRows ? [`${c.minRows}+ records`] : []),
  ];
}

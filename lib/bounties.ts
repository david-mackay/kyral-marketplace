import { formatSpan } from "@/components/ui";
import type { BountyCriteria } from "@/lib/data-profile";
import { CATEGORY_LABELS } from "@/lib/format";

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
  createdAt: string;
}

export function criteriaChips(c: BountyCriteria) {
  return [
    ...c.categories.map((x) => CATEGORY_LABELS[x] ?? x),
    ...c.requiredSignals,
    ...(c.minSpanDays ? [`${formatSpan(c.minSpanDays)}+ history`] : []),
    ...(c.minRows ? [`${c.minRows}+ records`] : []),
  ];
}

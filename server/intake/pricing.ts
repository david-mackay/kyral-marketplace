import type { DataProfile } from "@/lib/data-profile";

// Rough per-record market value by category in USD, informed by what
// research buyers pay for consented real-world data.
const CATEGORY_BASE: Record<string, number> = {
  genomics: 60,
  imaging: 25,
  conditions: 15,
  lab_results: 12,
  medications: 10,
  mixed: 10,
  wearable: 8,
  vitals: 6,
  demographics: 3,
  other: 4,
};

/**
 * Estimated standalone value in USDC smallest units. Longer histories and
 * richer measurements are worth more; matched bounties are priced separately.
 */
export function estimateValueUsdc(
  profile: Pick<DataProfile, "category" | "rowCount" | "spanDays" | "columns">
): number {
  const base = CATEGORY_BASE[profile.category] ?? CATEGORY_BASE.other!;
  const depth = 1 + Math.log10(1 + profile.rowCount) / 2;
  const history = 1 + Math.min(profile.spanDays, 730) / 365;
  const signals = profile.columns.filter((c) => c.type === "number").length;
  const richness = 1 + Math.min(signals, 12) * 0.08;

  const dollars = base * depth * history * richness;
  const roundedToHalf = Math.max(1, Math.round(dollars * 2) / 2);
  return Math.round(roundedToHalf * 1_000_000);
}

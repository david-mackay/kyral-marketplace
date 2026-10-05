import type { BountyCriteria, DataProfile } from "@/lib/data-profile";
import { SIGNAL_IDS } from "@/lib/signals";

const normalize = (s: string) => s.toLowerCase().replace(/[_\-]+/g, " ");

/**
 * Does this data satisfy what the researcher asked for? Signals are vocabulary
 * ids (`lib/signals.ts`); free-text signals from older requests, or profiles
 * without signal tags, fall back to keyword search.
 */
export function matchesCriteria(criteria: BountyCriteria, profile: DataProfile): boolean {
  if (criteria.categories.length > 0 && !criteria.categories.includes(profile.category)) {
    return false;
  }
  if (profile.rowCount < criteria.minRows || profile.spanDays < criteria.minSpanDays) {
    return false;
  }
  const haystack = normalize(
    [profile.title, profile.summary, profile.documentType, ...profile.tags, ...profile.columns.map((c) => c.name)].join(" ")
  );
  return criteria.requiredSignals.every((signal) =>
    SIGNAL_IDS.has(signal) && profile.signals ? profile.signals.includes(signal) : haystack.includes(normalize(signal))
  );
}

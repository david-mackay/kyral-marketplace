import { inArray } from "drizzle-orm";

import type { ColumnProfile, DataProfile } from "@/lib/data-profile";
import { db } from "@/server/db";
import { documents } from "@/server/db/schema";

export interface ProfileSummary {
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

/** Merge several files' profiles into what a buyer would receive. */
export function summarizeProfiles(profiles: DataProfile[]): ProfileSummary | null {
  if (profiles.length === 0) return null;
  const starts = profiles.flatMap((p) => (p.dateRange ? [p.dateRange.start] : [])).sort();
  const ends = profiles.flatMap((p) => (p.dateRange ? [p.dateRange.end] : [])).sort();
  const dateRange = starts.length ? { start: starts[0]!, end: ends[ends.length - 1]! } : null;

  const columns = new Map<string, ColumnProfile>();
  for (const p of profiles) {
    for (const c of p.columns) {
      const existing = columns.get(c.name);
      if (!existing) columns.set(c.name, { ...c });
      else {
        existing.nonEmpty += c.nonEmpty;
        if (c.min !== undefined) existing.min = Math.min(existing.min ?? c.min, c.min);
        if (c.max !== undefined) existing.max = Math.max(existing.max ?? c.max, c.max);
      }
    }
  }

  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    documentTypes: uniq(profiles.map((p) => p.documentType)),
    files: profiles.length,
    rowCount: profiles.reduce((sum, p) => sum + p.rowCount, 0),
    dateRange,
    spanDays: dateRange
      ? Math.round((Date.parse(dateRange.end) - Date.parse(dateRange.start)) / 86_400_000) + 1
      : 0,
    columns: [...columns.values()],
    tags: uniq(profiles.flatMap((p) => p.tags)).slice(0, 12),
    removedIdentifiers: uniq(profiles.flatMap((p) => p.removedIdentifiers)),
    suitableFor: uniq(profiles.flatMap((p) => p.suitableFor)).slice(0, 4),
  };
}

export async function profilesForDocuments(documentIds: string[]) {
  if (documentIds.length === 0) return new Map<string, DataProfile>();
  const docs = await db.query.documents.findMany({
    where: inArray(documents.id, documentIds),
    columns: { id: true, profile: true },
  });
  return new Map(
    docs.flatMap((d) => (d.profile ? [[d.id, d.profile] as const] : []))
  );
}

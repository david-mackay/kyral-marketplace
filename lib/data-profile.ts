/** What the intake agent learned about an uploaded file. Shared by server and UI. */
export interface DataProfile {
  title: string;
  summary: string;
  category: string;
  documentType: string;
  source: "spreadsheet" | "document";
  /** Ids from `lib/signals.ts`. Missing on profiles created before the vocabulary existed. */
  signals?: string[];
  /** Display labels for `signals`. */
  tags: string[];
  columns: ColumnProfile[];
  rowCount: number;
  dateRange: { start: string; end: string } | null;
  spanDays: number;
  /** Identifier kinds removed before anything is shared. */
  removedIdentifiers: string[];
  /** Researcher-facing hints: what studies this data could serve. */
  suitableFor: string[];
  estimatedValueUsdc: number;
  analyzer: "reducto" | "local" | "llm";
}

export interface ColumnProfile {
  name: string;
  type: "number" | "date" | "text";
  unit?: string;
  min?: number;
  max?: number;
  mean?: number;
  nonEmpty: number;
}

export const CONSENT_PURPOSES = ["academic", "nonprofit", "commercial", "pharma"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const PURPOSE_LABELS: Record<ConsentPurpose, string> = {
  academic: "University research",
  nonprofit: "Nonprofits & public health",
  commercial: "Health startups",
  pharma: "Pharma & drug trials",
};

export interface BountyCriteria {
  categories: string[];
  /** Signal ids from `lib/signals.ts` the data must contain, e.g. "hba1c". */
  requiredSignals: string[];
  minRows: number;
  minSpanDays: number;
}

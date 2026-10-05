import type { DataProfile } from "@/lib/data-profile";
import { CATEGORY_LABELS } from "@/lib/format";
import { categoryFor, detectSignals, signalCategory, signalLabel } from "@/lib/signals";
import { estimateValueUsdc } from "./pricing";
import { extractWithReducto, hasReducto, redactNarrativeWithReducto } from "./reducto";
import { parseCsv, profileAndDeidentify, toCsv, type TabularResult } from "./tabular";

const CATEGORIES = [
  "vitals", "lab_results", "demographics", "medications", "conditions",
  "imaging", "genomics", "wearable", "mixed", "other",
] as const;

const DOCUMENT_TYPES: Record<string, string> = {
  vitals: "Vitals log",
  lab_results: "Lab results",
  wearable: "Wearable health log",
  medications: "Medication history",
  conditions: "Symptom diary",
  genomics: "Genotype data",
  imaging: "Imaging report",
  mixed: "Health log",
  other: "Health log",
};

// A more specific name when one signal defines the file.
const SIGNAL_DOCUMENT_TYPES: [string, string][] = [
  ["systolic_bp", "Blood pressure log"],
  ["skin", "Skincare log"],
  ["menstrual", "Cycle log"],
];

const SUITABLE_FOR: Record<string, string[]> = {
  vitals: ["Hypertension and cardiovascular studies", "Remote monitoring research"],
  lab_results: ["Metabolic and cardiometabolic studies", "Biomarker reference ranges"],
  wearable: ["Digital biomarker research", "Sleep and recovery studies"],
  medications: ["Real-world drug effectiveness", "Side-effect and switching studies"],
  conditions: ["Symptom trajectory studies", "Patient-reported outcomes research"],
  genomics: ["Genetic association studies"],
  imaging: ["Imaging AI training sets"],
  mixed: ["Multi-modal health studies"],
  other: ["Lifestyle and behavior studies"],
};

function formatSpanText(days: number) {
  if (days >= 365) return `${Math.round((days / 365) * 10) / 10} years`;
  if (days >= 60) return `${Math.round(days / 30)} months`;
  return `${days} days`;
}

/** Deterministic title, summary, and category from the signals found in the data. */
function describe(signals: string[], rowCount: number, days: number, fallbackCategory = "other") {
  const category = categoryFor(signals, fallbackCategory);
  const documentType =
    SIGNAL_DOCUMENT_TYPES.find(([id]) => signals.includes(id))?.[1] ?? DOCUMENT_TYPES[category] ?? "Health log";
  // Lead with the signals that define the file.
  const ordered = [...signals].sort((x, y) => Number(signalCategory(y) === category) - Number(signalCategory(x) === category));
  const labels = ordered.map(signalLabel);
  const headline = labels.filter((l) => l !== documentType).slice(0, 3);
  const span = days > 1 ? ` over ${formatSpanText(days)}` : "";
  return {
    category,
    documentType,
    title: headline.length ? `${documentType}: ${headline.join(", ")}` : documentType,
    summary: `${rowCount.toLocaleString()} records${span}${labels.length ? ` covering ${labels.join(", ")}` : ""}. De-identified, with dates shifted.`,
    tags: labels,
    suitableFor: SUITABLE_FOR[category] ?? SUITABLE_FOR.other!,
  };
}

function spanDays(range: { start: string; end: string } | null) {
  if (!range) return 0;
  return Math.max(1, Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86_400_000) + 1);
}

export interface IntakeResult {
  profile: DataProfile;
  /** null when the file couldn't be safely de-identified; it stays private. */
  deidentified: { body: Buffer; contentType: string; fileName: string } | null;
}

function baseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_").slice(0, 60) || "data";
}

const narrativeRedactor = () => (hasReducto() ? redactNarrativeWithReducto : undefined);

function deidentifiedFile(table: TabularResult, fileName: string): IntakeResult["deidentified"] {
  if (table.rowCount === 0 || table.residualFindings.length > 0) return null;
  return {
    body: Buffer.from(table.deidentifiedCsv, "utf8"),
    contentType: "text/csv",
    fileName: `${baseName(fileName)}_deidentified.csv`,
  };
}

function privateSummary(table: TabularResult) {
  return table.residualFindings.length
    ? { summary: `Kept private: we found ${table.residualFindings.join(", ")} we couldn't safely remove.` }
    : {};
}

async function analyzeTable(text: string, fileName: string, delimiter: string, dateShiftDays: number): Promise<IntakeResult> {
  const table = await profileAndDeidentify(parseCsv(text, delimiter), dateShiftDays, narrativeRedactor());
  const signals = detectSignals([fileName, ...table.columns.map((c) => c.name), ...table.categoricalValues]);
  const days = spanDays(table.dateRange);

  const profile: DataProfile = {
    ...describe(signals, table.rowCount, days),
    ...privateSummary(table),
    source: "spreadsheet",
    signals,
    columns: table.columns,
    rowCount: table.rowCount,
    dateRange: table.dateRange,
    spanDays: days,
    removedIdentifiers: table.removedIdentifiers,
    estimatedValueUsdc: 0,
    analyzer: "local",
  };
  profile.estimatedValueUsdc = estimateValueUsdc(profile);
  return { profile, deidentified: deidentifiedFile(table, fileName) };
}

async function analyzeDocument(file: Buffer, fileName: string, dateShiftDays: number): Promise<IntakeResult> {
  const x = await extractWithReducto(file, fileName);

  // Rebuild the document as a table of measurements so the same
  // de-identification (date shift, free-text scrub) applies.
  const rows = [
    ["measurement", "value", "unit", "reference_range", "date"],
    ...x.measurements.map((m) => [m.name, m.value, m.unit ?? "", m.referenceRange ?? "", m.date ?? ""]),
  ];
  const table = await profileAndDeidentify(parseCsv(toCsv(rows)), dateShiftDays, narrativeRedactor());
  const signals = detectSignals([
    x.documentType,
    ...x.measurements.map((m) => m.name),
    ...(x.conditions ?? []),
    ...(x.medications?.length ? ["medication"] : []),
  ]);
  const days = spanDays(table.dateRange);
  const reductoCategory = (CATEGORIES as readonly string[]).includes(x.category) ? x.category : "other";
  const described = describe(signals, table.rowCount, days, reductoCategory);

  const profile: DataProfile = {
    ...described,
    // Reducto names the document better than our templates; its text is instructed to exclude identifiers.
    documentType: x.documentType || described.documentType,
    ...privateSummary(table),
    source: "document",
    signals,
    columns: table.columns,
    rowCount: table.rowCount,
    dateRange: table.dateRange,
    spanDays: days,
    removedIdentifiers: [...new Set([...(x.identifiersPresent ?? []), ...table.removedIdentifiers])],
    estimatedValueUsdc: 0,
    analyzer: "reducto",
  };
  profile.estimatedValueUsdc = estimateValueUsdc(profile);
  return { profile, deidentified: deidentifiedFile(table, fileName) };
}

/**
 * Work out what an uploaded file is, profile it for researchers, strip
 * identifiers, and estimate what it's worth. Patient content only ever goes to
 * our own code and Reducto (HIPAA-covered).
 */
export async function analyzeUpload(args: {
  body: Buffer;
  fileName: string;
  contentType: string;
  dateShiftDays: number;
}): Promise<IntakeResult> {
  const { body, fileName, contentType, dateShiftDays } = args;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "csv" || ext === "tsv" || contentType === "text/csv") {
    return analyzeTable(body.toString("utf8"), fileName, ext === "tsv" ? "\t" : ",", dateShiftDays);
  }

  if (hasReducto()) {
    return analyzeDocument(body, fileName, dateShiftDays);
  }

  // Without a document parser we can't verify what's inside, so the file stays
  // private and isn't offered to buyers.
  const signals = detectSignals([fileName]);
  return {
    profile: {
      ...describe(signals, 0, 0),
      title: CATEGORY_LABELS[categoryFor(signals)] ?? "Health document",
      summary: "Stored privately. Add a REDUCTO_API_KEY to parse and de-identify documents like this.",
      source: "document",
      signals,
      columns: [],
      rowCount: 0,
      dateRange: null,
      spanDays: 0,
      removedIdentifiers: [],
      estimatedValueUsdc: 0,
      analyzer: "local",
    },
    deidentified: null,
  };
}

import { z } from "zod";

import type { ColumnProfile, DataProfile } from "@/lib/data-profile";
import { chatJson, hasOpenRouter } from "@/server/bioagents/openrouter";
import { estimateValueUsdc } from "./pricing";
import { extractWithReducto, hasReducto, redactNarrativeWithReducto } from "./reducto";
import { parseCsv, profileAndDeidentify, toCsv } from "./tabular";

const CATEGORIES = [
  "vitals", "lab_results", "demographics", "medications", "conditions",
  "imaging", "genomics", "wearable", "mixed", "other",
] as const;

const ClassificationSchema = z.object({
  title: z.string(),
  summary: z.string(),
  documentType: z.string(),
  category: z.enum(CATEGORIES).catch("other"),
  tags: z.array(z.string()).catch([]),
  suitableFor: z.array(z.string()).catch([]),
});
type Classification = z.infer<typeof ClassificationSchema>;

const CLASSIFY_PROMPT = `You classify a patient's de-identified health data for a research data marketplace.
Return JSON: {"title": short neutral title, "summary": 2 sentences for researchers on what the data contains and its time span,
"documentType": e.g. "Blood pressure home log", "category": one of ${CATEGORIES.join(", ")},
"tags": 3-8 lowercase signals/biomarkers present (e.g. "hrv", "hba1c", "systolic", "sleep", "long covid"),
"suitableFor": 2-4 short study types this could serve (e.g. "Hypertension lifestyle studies")}.
Never include personal names or identifiers.`;

const KEYWORD_CATEGORIES: [RegExp, (typeof CATEGORIES)[number], string][] = [
  [/hrv|heart_rate|steps|sleep_score|spo2|calories/i, "wearable", "Wearable health log"],
  [/systolic|diastolic|blood_pressure|pulse/i, "vitals", "Blood pressure log"],
  [/test_name|reference_range|result|hba1c|glucose|cholesterol/i, "lab_results", "Lab results"],
  [/medication|dose|prescri/i, "medications", "Medication history"],
  [/symptom|fatigue|brain_fog|pain|diagnos/i, "conditions", "Symptom diary"],
  [/genotype|rsid|allele|chromosome/i, "genomics", "Genotype data"],
];

function heuristicClassification(fileName: string, columns: ColumnProfile[]): Classification {
  const haystack = `${fileName} ${columns.map((c) => c.name).join(" ")}`;
  const hit = KEYWORD_CATEGORIES.find(([re]) => re.test(haystack));
  const label = hit?.[2] ?? "Health data";
  return {
    title: label,
    summary: `${label} with ${columns.length} fields.`,
    documentType: label,
    category: hit?.[1] ?? "other",
    tags: columns
      .filter((c) => c.type === "number")
      .slice(0, 8)
      .map((c) => c.name.replace(UNIT_SUFFIX_RE, "").replace(/_/g, " ").toLowerCase()),
    suitableFor: [],
  };
}

const UNIT_SUFFIX_RE = /_(mmhg|bpm|ms|mg_?dl|kg|hrs?|mins?|1_10|1_5)$/i;

async function classify(fileName: string, context: string, columns: ColumnProfile[]): Promise<{ result: Classification; usedLlm: boolean }> {
  if (!hasOpenRouter()) return { result: heuristicClassification(fileName, columns), usedLlm: false };
  try {
    const raw = await chatJson(CLASSIFY_PROMPT, context, 600);
    return { result: ClassificationSchema.parse(raw), usedLlm: true };
  } catch (error) {
    console.error("Classification failed, using heuristics", error);
    return { result: heuristicClassification(fileName, columns), usedLlm: false };
  }
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

async function analyzeTable(text: string, fileName: string, delimiter: string, dateShiftDays: number): Promise<IntakeResult> {
  const table = await profileAndDeidentify(parseCsv(text, delimiter), dateShiftDays, narrativeRedactor());
  const unsafe = table.residualFindings.length > 0;
  const context = [
    `File: ${fileName}`,
    `Rows: ${table.rowCount}`,
    `Date range (shifted): ${table.dateRange ? `${table.dateRange.start} to ${table.dateRange.end}` : "none"}`,
    `Columns: ${table.columns.map((c) => `${c.name} (${c.type}${c.unit ? `, ${c.unit}` : ""})`).join("; ")}`,
    `Sample rows: ${JSON.stringify(table.sampleRows.slice(0, 3))}`,
  ].join("\n");
  // Only de-identified content may reach the classifier.
  const { result, usedLlm } = unsafe
    ? { result: heuristicClassification(fileName, table.columns), usedLlm: false }
    : await classify(fileName, context, table.columns);

  const days = spanDays(table.dateRange);
  const profile: DataProfile = {
    ...result,
    ...(unsafe && { summary: `Kept private: we found ${table.residualFindings.join(", ")} we couldn't safely remove.` }),
    source: "spreadsheet",
    columns: table.columns,
    rowCount: table.rowCount,
    dateRange: table.dateRange,
    spanDays: days,
    removedIdentifiers: table.removedIdentifiers,
    estimatedValueUsdc: 0,
    analyzer: usedLlm ? "llm" : "local",
  };
  profile.estimatedValueUsdc = estimateValueUsdc(profile);

  return {
    profile,
    deidentified: unsafe
      ? null
      : {
          body: Buffer.from(table.deidentifiedCsv, "utf8"),
          contentType: "text/csv",
          fileName: `${baseName(fileName)}_deidentified.csv`,
        },
  };
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
  const days = spanDays(table.dateRange);

  const tags = [
    ...new Set([
      ...x.measurements.map((m) => m.name.toLowerCase()).slice(0, 6),
      ...(x.conditions ?? []).map((c) => c.toLowerCase()),
    ]),
  ].slice(0, 8);

  const category = (CATEGORIES as readonly string[]).includes(x.category) ? x.category : "other";
  const profile: DataProfile = {
    title: x.title,
    summary: x.summary,
    documentType: x.documentType,
    category,
    source: "document",
    tags,
    columns: table.columns,
    rowCount: table.rowCount,
    dateRange: table.dateRange,
    spanDays: days,
    removedIdentifiers: [...new Set([...(x.identifiersPresent ?? []), ...table.removedIdentifiers])],
    suitableFor: [],
    estimatedValueUsdc: 0,
    analyzer: "reducto",
  };
  profile.estimatedValueUsdc = estimateValueUsdc(profile);

  return {
    profile,
    deidentified:
      table.rowCount > 0 && table.residualFindings.length === 0
        ? {
            body: Buffer.from(table.deidentifiedCsv, "utf8"),
            contentType: "text/csv",
            fileName: `${baseName(fileName)}_deidentified.csv`,
          }
        : null,
  };
}

/**
 * Work out what an uploaded file is, profile it for researchers, strip
 * identifiers, and estimate what it's worth.
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
  const { result } = await classify(fileName, `File name: ${fileName}\nContent type: ${contentType}`, []);
  return {
    profile: {
      ...result,
      summary: "Stored privately. Add a REDUCTO_API_KEY to parse and de-identify documents like this.",
      source: "document",
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

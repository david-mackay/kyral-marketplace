import type { ColumnProfile } from "@/lib/data-profile";

/** RFC 4180-ish CSV parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((r) => r.map((f) => (/[",\n\r]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f)).join(","))
    .join("\n");
}

// Columns that identify a person outright (HIPAA Safe Harbor identifiers).
const IDENTIFIER_COLUMNS: [RegExp, string][] = [
  [/^(patient_?|full_?|first_?|last_?|middle_?|given_?|family_?|sur)?name$/i, "names"],
  [/(^|_)(dob|birth_?date|date_?of_?birth|birthday)($|_)/i, "birth dates"],
  [/(^|_)(ssn|social_?security)($|_)/i, "social security numbers"],
  [/(^|_)(mrn|medical_?record|patient_?id|member_?id|insurance_?id|policy)($|_)/i, "record numbers"],
  [/(^|_)(e_?mail)($|_)/i, "email addresses"],
  [/(^|_)(phone|mobile|cell|fax|telephone)($|_)/i, "phone numbers"],
  [/(^|_)(address|street|city|zip|postal|postcode)($|_)/i, "addresses"],
  [/(^|_)(ip_?address|device_?serial|serial_?number|url)($|_)/i, "device and web identifiers"],
  [/(^|_)(physician|doctor|provider_?name|prescriber)($|_)/i, "care-team names"],
];

const FREE_TEXT_SCRUBBERS: [RegExp, string, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]", "email addresses"],
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[id]", "social security numbers"],
  [/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, "[phone]", "phone numbers"],
  [/\b(MRN|mrn|Patient ID|patient id)[:#\s]*\w+/g, "[record]", "record numbers"],
  [/\b(Dr|Dr\.|Doctor)\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?/g, "[clinician]", "care-team names"],
  [/\b\d{1,5}\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Blvd|Lane|Ln|Drive|Dr)\b\.?/g, "[address]", "addresses"],
];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function parseDate(value: string): Date | null {
  const v = value.trim();
  let m = v.match(ISO_DATE);
  if (m) return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  m = v.match(US_DATE);
  if (m) return new Date(Date.UTC(+m[3]!, +m[1]! - 1, +m[2]!));
  return null;
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseNumber(value: string): number | null {
  const v = value.trim().replace(/,/g, "");
  if (v === "" || !/^-?\d*\.?\d+$/.test(v)) return null;
  return Number(v);
}

const UNIT_SUFFIX = /_(mmhg|bpm|ms|mg_?dl|mmol_?l|kg|lbs?|cm|hrs?|mins?|minutes|liters|units|pct|percent|1_10|1_5)$/i;

export interface TabularResult {
  columns: ColumnProfile[];
  rowCount: number;
  dateRange: { start: string; end: string } | null;
  removedIdentifiers: string[];
  deidentifiedCsv: string;
  sampleRows: Record<string, string>[];
}

/**
 * Profile a table and produce its de-identified derivative: identifier columns
 * dropped, free text scrubbed, every date shifted by `dateShiftDays`, ages over
 * 89 generalized.
 */
export function profileAndDeidentify(rows: string[][], dateShiftDays: number): TabularResult {
  const [header = [], ...body] = rows;
  const removed = new Set<string>();

  const keep: number[] = [];
  header.forEach((name, i) => {
    const hit = IDENTIFIER_COLUMNS.find(([re]) => re.test(name.trim()));
    if (hit) removed.add(hit[1]);
    else keep.push(i);
  });

  const columns: ColumnProfile[] = keep.map((i) => {
    const name = header[i]!.trim();
    const values = body.map((r) => (r[i] ?? "").trim()).filter((v) => v !== "");
    const dates = values.map(parseDate);
    const numbers = values.map(parseNumber);
    const unit = name.match(UNIT_SUFFIX)?.[1]?.toLowerCase().replace(/_/g, "/");

    if (values.length > 0 && dates.every((d) => d)) {
      return { name, type: "date" as const, nonEmpty: values.length };
    }
    if (values.length > 0 && numbers.every((n) => n !== null)) {
      const nums = numbers as number[];
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      return {
        name,
        type: "number" as const,
        unit,
        min: Math.min(...nums),
        max: Math.max(...nums),
        mean: Math.round(mean * 100) / 100,
        nonEmpty: values.length,
      };
    }
    return { name, type: "text" as const, nonEmpty: values.length };
  });

  const shiftMs = dateShiftDays * 86_400_000;
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  const deidRows = body.map((r) =>
    keep.map((i, k) => {
      const col = columns[k]!;
      let v = (r[i] ?? "").trim();
      if (v === "") return v;

      if (col.type === "date") {
        const d = parseDate(v)!;
        const shifted = new Date(d.getTime() + shiftMs);
        if (!minDate || shifted < minDate) minDate = shifted;
        if (!maxDate || shifted > maxDate) maxDate = shifted;
        return isoDay(shifted);
      }
      if (col.type === "number" && /^age($|_)/i.test(col.name)) {
        const n = Number(v);
        if (n > 89) {
          removed.add("ages over 89");
          return "90+";
        }
        return v;
      }
      if (col.type === "text") {
        for (const [re, replacement, label] of FREE_TEXT_SCRUBBERS) {
          const next = v.replace(re, replacement);
          if (next !== v) removed.add(label);
          v = next;
        }
      }
      return v;
    })
  );

  const keptHeader = keep.map((i) => header[i]!.trim());
  const dateRange =
    minDate && maxDate ? { start: isoDay(minDate), end: isoDay(maxDate) } : null;

  return {
    columns,
    rowCount: body.length,
    dateRange,
    removedIdentifiers: [...removed],
    deidentifiedCsv: toCsv([keptHeader, ...deidRows]),
    sampleRows: deidRows.slice(0, 5).map((r) =>
      Object.fromEntries(keptHeader.map((h, i) => [h, r[i] ?? ""]))
    ),
  };
}

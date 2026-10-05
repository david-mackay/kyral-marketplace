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

/** "Patient Name" / "patient-name" / "PatientName" → "patient_name". */
export function normalizeHeader(name: string) {
  return name
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// Columns that identify a person outright (HIPAA Safe Harbor identifiers),
// matched against normalized headers.
const IDENTIFIER_COLUMNS: [RegExp, string][] = [
  [/^(patient_|full_|first_|last_|middle_|given_|family_|sur|nick)?name$/, "names"],
  [/(^|_)(initials|guardian|emergency_contact|next_of_kin|spouse|relative)($|_)/, "names"],
  [/(^|_)(dob|birth_?date|date_of_birth|birthday|born)($|_)/, "birth dates"],
  [/(^|_)(ssn|social_security|sin|nhs_number|national_id|passport|license|licence)($|_)/, "government IDs"],
  [/(^|_)(mrn|medical_record|record_number|patient_id|member_id|insurance_id|policy|account|beneficiary|health_plan)($|_)/, "record numbers"],
  [/(^|_)(e_?mail)($|_)/, "email addresses"],
  [/(^|_)(phone|mobile|cell|fax|telephone|contact)($|_)/, "phone numbers"],
  [/(^|_)(address|street|city|town|zip|zipcode|postal|postcode|county|state|province|country|lat|latitude|lon|lng|longitude|geo|location)($|_)/, "addresses and locations"],
  [/(^|_)(ip|ip_address|device_id|device_serial|serial|serial_number|imei|mac_address|url|website|username|user_id)($|_)/, "device and web identifiers"],
  [/(^|_)(physician|doctor|provider|clinician|nurse|prescriber|practitioner|attending)($|_)/, "care-team names"],
  [/(^|_)(hospital|clinic|facility|practice|pharmacy)($|_)/, "care locations"],
  [/(^|_)(photo|image|face|signature|fingerprint|biometric)($|_)/, "photos and biometrics"],
];

const US_STATES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";

const FREE_TEXT_SCRUBBERS: [RegExp, string, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]", "email addresses"],
  [/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "[url]", "device and web identifiers"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]", "device and web identifiers"],
  [/\b(?:MRN|Patient ID|Member ID|Acct)\s*(?:#|no\.?|number)?[:#\s]*[A-Z0-9-]{4,}|\b(?:Record|Account|Policy)\s*(?:#|no\.?|number)[:#\s]*[A-Z0-9-]{4,}/gi, "[record]", "record numbers"],
  [/\b(?:SSN|social security)\s*(?:#|no\.?|number)?[:#\s]*\d{3}-?\d{2}-?\d{4}\b/gi, "[id]", "government IDs"],
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[id]", "government IDs"],
  [/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, "[phone]", "phone numbers"],
  [/(?:\+?1)?\b\d{10}\b/g, "[phone]", "phone numbers"],
  [/\b\d{9}\b/g, "[id]", "government IDs"],
  [/\b(Dr|Dr\.|Doctor|Nurse|NP|PA)\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?/g, "[clinician]", "care-team names"],
  [/\b\d{1,6}\s+(?:[A-Z][a-z]+\s+){1,3}(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace|Circle)\b\.?/g, "[address]", "addresses and locations"],
  // "Boston, MA" or "Boston MA 02134". A bare "MA"/"OK" after a word is too ambiguous.
  [new RegExp(`\\b(?:[A-Z][a-z]+\\s){0,2}[A-Z][a-z]+(?:,\\s*(?:${US_STATES})\\b(?:\\s+\\d{5}(?:-\\d{4})?)?|\\s+(?:${US_STATES})\\s+\\d{5}(?:-\\d{4})?\\b)`, "g"), "[location]", "addresses and locations"],
  [/\b(?:zip|zipcode|postal code)[:\s]*\d{5}(?:-\d{4})?\b/gi, "[location]", "addresses and locations"],
];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

function monthIndex(name: string) {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase());
}

function utc(y: number, m: number, d: number): Date | null {
  if (y < 100) y += y < 50 ? 2000 : 1900;
  const date = new Date(Date.UTC(y, m, d));
  return date.getUTCMonth() === m && date.getUTCDate() === d && y >= 1900 && y <= 2100 ? date : null;
}

// Each format: a pattern anchored for whole-value parsing, and how to read it.
const DATE_FORMATS: [string, (m: RegExpMatchArray) => Date | null][] = [
  [String.raw`(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?`, (m) => utc(+m[1]!, +m[2]! - 1, +m[3]!)],
  [String.raw`(\d{1,2})/(\d{1,2})/(\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?)?`, (m) => utc(+m[3]!, +m[1]! - 1, +m[2]!)],
  [String.raw`(\d{1,2})[-\s]${MONTH_RE}\.?[-\s,]+(\d{2,4})`, (m) => utc(+m[3]!, monthIndex(m[2]!), +m[1]!)],
  [String.raw`${MONTH_RE}\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})`, (m) => utc(+m[3]!, monthIndex(m[1]!), +m[2]!)],
];

const WHOLE_DATE = DATE_FORMATS.map(([src, read]) => [new RegExp(`^${src}$`, "i"), read] as const);
const DATE_IN_TEXT = new RegExp(DATE_FORMATS.map(([src]) => `(?:${src})`).join("|"), "gi");

export function parseDate(value: string): Date | null {
  const v = value.trim();
  for (const [re, read] of WHOLE_DATE) {
    const m = v.match(re);
    if (m) return read(m);
  }
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
const AGE_COLUMN = /(^|_)age($|_)/;

/** Share of non-empty values that must parse for a column to count as dates. */
const DATE_COLUMN_THRESHOLD = 0.8;

/** Text columns that read like prose (notes, comments) rather than categories. */
function isNarrative(values: string[]) {
  if (values.length === 0) return false;
  const wordy = values.filter((v) => v.split(/\s+/).length >= 4).length;
  return wordy / values.length >= 0.2;
}

/**
 * Replaces people, places, and organizations in free text. Returns null if it
 * can't, in which case the narrative columns are dropped.
 */
export type NarrativeRedactor = (texts: string[]) => Promise<string[] | null>;

export interface TabularResult {
  columns: ColumnProfile[];
  rowCount: number;
  dateRange: { start: string; end: string } | null;
  removedIdentifiers: string[];
  deidentifiedCsv: string;
  sampleRows: Record<string, string>[];
  /** Identifier-like content still present after scrubbing. Non-empty means don't share. */
  residualFindings: string[];
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Profile a table and produce its de-identified derivative:
 * - identifier columns dropped (matched on normalized headers)
 * - every date shifted by `dateShiftDays`, including dates inside free text;
 *   values in a date column that can't be parsed are blanked, not passed through
 * - ages over 89 generalized to "90+"
 * - free text scrubbed by pattern, then narrative columns redacted by
 *   `redactNarrative` (or dropped if there is none)
 * - values from dropped identifier columns (e.g. the patient's name) removed
 *   wherever else they appear
 * - a final residual scan; anything it finds is reported in `residualFindings`
 */
export async function profileAndDeidentify(
  rows: string[][],
  dateShiftDays: number,
  redactNarrative?: NarrativeRedactor
): Promise<TabularResult> {
  const [header = [], ...body] = rows;
  const removed = new Set<string>();
  const knownIdentifiers = new Set<string>();

  let keep: number[] = [];
  header.forEach((name, i) => {
    const hit = IDENTIFIER_COLUMNS.find(([re]) => re.test(normalizeHeader(name)));
    if (!hit) return keep.push(i);
    removed.add(hit[1]);
    for (const r of body) {
      const v = (r[i] ?? "").trim();
      if (v.length >= 3 && !parseNumber(v)) {
        knownIdentifiers.add(v);
        for (const part of v.split(/[\s,]+/)) if (part.length >= 3 && /^[A-Za-z'-]+$/.test(part)) knownIdentifiers.add(part);
      }
    }
  });

  type Kind = "date" | "number" | "text" | "narrative";
  const kinds: Kind[] = [];
  let columns: ColumnProfile[] = keep.map((i) => {
    const name = header[i]!.trim();
    const values = body.map((r) => (r[i] ?? "").trim()).filter((v) => v !== "");
    const dateHits = values.filter((v) => parseDate(v)).length;
    const numbers = values.map(parseNumber);
    const unit = name.match(UNIT_SUFFIX)?.[1]?.toLowerCase().replace(/_/g, "/");

    if (values.length > 0 && dateHits / values.length >= DATE_COLUMN_THRESHOLD) {
      kinds.push("date");
      return { name, type: "date" as const, nonEmpty: values.length };
    }
    if (values.length > 0 && numbers.every((n) => n !== null)) {
      kinds.push("number");
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
    kinds.push(isNarrative(values) ? "narrative" : "text");
    return { name, type: "text" as const, nonEmpty: values.length };
  });

  const shiftMs = dateShiftDays * 86_400_000;
  const shift = (d: Date) => new Date(d.getTime() + shiftMs);
  let minDate: Date | null = null;
  let maxDate: Date | null = null;
  const identifierPattern = knownIdentifiers.size
    ? new RegExp(`\\b(?:${[...knownIdentifiers].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|")})\\b`, "gi")
    : null;

  const scrubText = (input: string, shiftDates = true) => {
    let v = shiftDates
      ? input.replace(DATE_IN_TEXT, (match) => {
          const d = parseDate(match);
          if (!d) return "[date]";
          removed.add("exact dates");
          return isoDay(shift(d));
        })
      : input;
    for (const [re, replacement, label] of FREE_TEXT_SCRUBBERS) {
      const next = v.replace(re, replacement);
      if (next !== v) removed.add(label);
      v = next;
    }
    if (identifierPattern) {
      const next = v.replace(identifierPattern, "[name]");
      if (next !== v) removed.add("names");
      v = next;
    }
    return v;
  };

  let deidRows = body.map((r) =>
    keep.map((i, k) => {
      const v = (r[i] ?? "").trim();
      if (v === "") return v;
      const col = columns[k]!;

      if (kinds[k] === "date") {
        const d = parseDate(v);
        if (!d) {
          removed.add("unreadable dates");
          return "";
        }
        const shifted = shift(d);
        if (!minDate || shifted < minDate) minDate = shifted;
        if (!maxDate || shifted > maxDate) maxDate = shifted;
        return isoDay(shifted);
      }
      if (kinds[k] === "number") {
        if (AGE_COLUMN.test(normalizeHeader(col.name)) && Number(v) > 89) {
          removed.add("ages over 89");
          return "90+";
        }
        return v;
      }
      return scrubText(v);
    })
  );

  // Names, places, and organizations in prose need a model; patterns can't find them.
  const narrativeCols = kinds.flatMap((k, idx) => (k === "narrative" ? [idx] : []));
  if (narrativeCols.length > 0) {
    const unique = [...new Set(narrativeCols.flatMap((c) => deidRows.map((r) => r[c]!)).filter(Boolean))];
    const redacted = redactNarrative ? await redactNarrative(unique).catch(() => null) : null;
    if (redacted && redacted.length === unique.length) {
      const map = new Map(unique.map((u, i) => [u, scrubText(redacted[i]!, false)]));
      deidRows = deidRows.map((r) => r.map((v, c) => (narrativeCols.includes(c) ? (map.get(v) ?? v) : v)));
      removed.add("names in notes");
    } else {
      const drop = new Set(narrativeCols);
      deidRows = deidRows.map((r) => r.filter((_, c) => !drop.has(c)));
      columns = columns.filter((_, c) => !drop.has(c));
      keep = keep.filter((_, c) => !drop.has(c));
      removed.add("free-text notes");
    }
  }

  const keptHeader = keep.map((i) => header[i]!.trim());
  const deidentifiedCsv = toCsv([keptHeader, ...deidRows]);
  const dateRange = minDate && maxDate ? { start: isoDay(minDate), end: isoDay(maxDate) } : null;

  return {
    columns,
    rowCount: body.length,
    dateRange,
    removedIdentifiers: [...removed],
    deidentifiedCsv,
    sampleRows: deidRows.slice(0, 5).map((r) => Object.fromEntries(keptHeader.map((h, i) => [h, r[i] ?? ""]))),
    residualFindings: residualScan(keptHeader, deidRows, identifierPattern),
  };
}

/** Last line of defense: anything here means the output is not safe to share. */
function residualScan(header: string[], rows: string[][], identifierPattern: RegExp | null): string[] {
  const findings = new Set<string>();
  for (const h of header) {
    if (IDENTIFIER_COLUMNS.some(([re]) => re.test(normalizeHeader(h)))) findings.add(`identifier column "${h}"`);
  }
  const text = rows.map((r) => r.join(" ")).join("\n");
  const checks: [RegExp, string][] = [
    [/[\w.+-]+@[\w-]+\.[\w.]+/, "email address"],
    [/\b\d{3}-\d{2}-\d{4}\b/, "SSN-like number"],
    [/\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/, "phone number"],
    [/\b(MRN|Patient ID)\s*[:#]?\s*[A-Z0-9-]{4,}/i, "record number"],
  ];
  for (const [re, label] of checks) if (re.test(text)) findings.add(label);
  if (identifierPattern) {
    identifierPattern.lastIndex = 0;
    if (identifierPattern.test(text)) findings.add("value from an identifier column");
  }
  return [...findings];
}

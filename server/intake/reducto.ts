const REDUCTO_URL = "https://platform.reducto.ai";

export function hasReducto() {
  return !!process.env.REDUCTO_API_KEY;
}

function headers() {
  return { Authorization: `Bearer ${process.env.REDUCTO_API_KEY}` };
}

export interface ReductoExtraction {
  documentType: string;
  category: string;
  title: string;
  summary: string;
  collectionDates: string[];
  measurements: {
    name: string;
    value: string;
    unit?: string;
    referenceRange?: string;
    date?: string;
  }[];
  conditions: string[];
  medications: string[];
  identifiersPresent: string[];
}

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    documentType: {
      type: "string",
      description: "What this document is, e.g. 'Comprehensive metabolic panel', 'Discharge summary', 'Oura sleep export'.",
    },
    category: {
      type: "string",
      enum: ["vitals", "lab_results", "demographics", "medications", "conditions", "imaging", "genomics", "wearable", "mixed", "other"],
    },
    title: { type: "string", description: "Short neutral title with no personal names." },
    summary: {
      type: "string",
      description: "Two sentences on what health information is present. Never include names, addresses, dates of birth, or record numbers.",
    },
    collectionDates: {
      type: "array",
      items: { type: "string" },
      description: "Dates the measurements were collected, ISO YYYY-MM-DD.",
    },
    measurements: {
      type: "array",
      description: "Every individual result or reading in the document.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          value: { type: "string" },
          unit: { type: "string" },
          referenceRange: { type: "string" },
          date: { type: "string", description: "ISO YYYY-MM-DD" },
        },
        required: ["name", "value"],
      },
    },
    conditions: { type: "array", items: { type: "string" } },
    medications: { type: "array", items: { type: "string" } },
    identifiersPresent: {
      type: "array",
      items: { type: "string" },
      description: "Kinds of personal identifiers visible in the document (e.g. 'names', 'dates of birth', 'addresses', 'record numbers'). Do not list the values.",
    },
  },
  required: ["documentType", "category", "title", "summary", "measurements", "identifiersPresent"],
};

// Reducto is HIPAA-covered; raw patient content goes nowhere else. Uploads and
// jobs are deleted as soon as we have the result.
async function cleanup(fileId: string, jobId?: string) {
  const del = (path: string) => fetch(`${REDUCTO_URL}${path}`, { method: "DELETE", headers: headers() }).catch(() => null);
  await Promise.all([del(`/upload/${encodeURIComponent(fileId)}`), jobId ? del(`/job/${jobId}`) : null]);
}

async function upload(file: Buffer, fileName: string): Promise<string> {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(file)]), fileName);
  const res = await fetch(`${REDUCTO_URL}/upload`, { method: "POST", headers: headers(), body: form });
  if (!res.ok) throw new Error(`Reducto upload failed (${res.status}): ${await res.text()}`);
  const { file_id } = (await res.json()) as { file_id: string };
  return file_id.startsWith("reducto://") ? file_id : `reducto://${file_id}`;
}

async function extract<T>(input: string, schema: object, systemPrompt: string): Promise<T> {
  const res = await fetch(`${REDUCTO_URL}/extract`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ input, instructions: { schema, system_prompt: systemPrompt } }),
  });
  if (!res.ok) throw new Error(`Reducto extract failed (${res.status}): ${await res.text()}`);
  const { result, job_id } = (await res.json()) as { result: unknown; job_id?: string };
  await cleanup(input, job_id);
  return (Array.isArray(result) ? result[0] : result) as T;
}

/** Ask Reducto what a medical document is and pull out its structured contents. */
export async function extractWithReducto(file: Buffer, fileName: string): Promise<ReductoExtraction> {
  const input = await upload(file, fileName);
  try {
    return await extract<ReductoExtraction>(
      input,
      EXTRACTION_SCHEMA,
      "You are processing a patient's own health record for a privacy-preserving research marketplace. Extract clinical content precisely. Never copy personal identifiers into any field."
    );
  } catch (error) {
    await cleanup(input);
    throw error;
  }
}

const IDENTIFIER_SCHEMA = {
  type: "object",
  properties: {
    people: {
      type: "array",
      items: { type: "string" },
      description: "Every person's name, first name, surname, nickname, or initials, copied exactly as written. Includes the patient, family, and clinicians.",
    },
    places: {
      type: "array",
      items: { type: "string" },
      description: "Every geographic location smaller than a US state: cities, towns, neighborhoods, streets, addresses, ZIP codes, landmarks. Exactly as written.",
    },
    organizations: {
      type: "array",
      items: { type: "string" },
      description: "Hospitals, clinics, practices, pharmacies, employers, schools, and churches, exactly as written.",
    },
    other: {
      type: "array",
      items: { type: "string" },
      description: "Any other text that could identify the person: ID or account numbers, usernames, vehicle plates, unique events, exactly as written.",
    },
  },
  required: ["people", "places", "organizations", "other"],
};

type FoundIdentifiers = { people: string[]; places: string[]; organizations: string[]; other: string[] };

const MAX_NARRATIVE_CHARS = 200_000;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Redact people, places, organizations, and other identifiers from free-text
 * notes. Reducto finds the strings; replacement happens locally so nothing
 * clinical is rewritten. Returns null when it can't run.
 */
export async function redactNarrativeWithReducto(texts: string[]): Promise<string[] | null> {
  if (!hasReducto() || texts.length === 0) return null;
  const doc = texts.map((t, i) => `[${i + 1}] ${t.replace(/\s+/g, " ")}`).join("\n");
  if (doc.length > MAX_NARRATIVE_CHARS) return null;

  const input = await upload(Buffer.from(doc, "utf8"), "notes.txt");
  let found: FoundIdentifiers;
  try {
    found = await extract<FoundIdentifiers>(
      input,
      IDENTIFIER_SCHEMA,
      "You are a HIPAA de-identification assistant. Each line is a separate note from one patient's health log. List every identifier you find. Do not list symptoms, conditions, medications, foods, products, or activities."
    );
  } catch (error) {
    await cleanup(input);
    throw error;
  }

  const replacements: [string, string][] = [];
  const add = (values: string[] | undefined, label: string) => {
    for (const v of values ?? []) {
      const value = v.trim();
      if (value.length < 2) continue;
      replacements.push([value, label]);
      if (label === "[name]") {
        for (const part of value.split(/\s+/)) if (part.length >= 3) replacements.push([part, label]);
      }
    }
  };
  add(found.people, "[name]");
  add(found.places, "[place]");
  add(found.organizations, "[organization]");
  add(found.other, "[id]");
  replacements.sort((a, b) => b[0].length - a[0].length);

  return texts.map((text) =>
    replacements.reduce(
      (t, [value, label]) => t.replace(new RegExp(`(?<![\\w])${escapeRegExp(value)}(?![\\w])`, "gi"), label),
      text
    )
  );
}

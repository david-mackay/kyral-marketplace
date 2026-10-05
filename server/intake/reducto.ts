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

async function upload(file: Buffer, fileName: string): Promise<string> {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(file)]), fileName);
  const res = await fetch(`${REDUCTO_URL}/upload`, { method: "POST", headers: headers(), body: form });
  if (!res.ok) throw new Error(`Reducto upload failed (${res.status}): ${await res.text()}`);
  const { file_id } = (await res.json()) as { file_id: string };
  return file_id.startsWith("reducto://") ? file_id : `reducto://${file_id}`;
}

/** Ask Reducto what a medical document is and pull out its structured contents. */
export async function extractWithReducto(file: Buffer, fileName: string): Promise<ReductoExtraction> {
  const input = await upload(file, fileName);
  const res = await fetch(`${REDUCTO_URL}/extract`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({
      input,
      instructions: {
        schema: EXTRACTION_SCHEMA,
        system_prompt:
          "You are processing a patient's own health record for a privacy-preserving research marketplace. Extract clinical content precisely. Never copy personal identifiers into any field.",
      },
    }),
  });
  if (!res.ok) throw new Error(`Reducto extract failed (${res.status}): ${await res.text()}`);
  const { result } = (await res.json()) as { result: unknown };
  const value = Array.isArray(result) ? result[0] : result;
  return value as ReductoExtraction;
}

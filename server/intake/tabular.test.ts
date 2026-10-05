import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { normalizeHeader, parseCsv, parseDate, profileAndDeidentify, type NarrativeRedactor } from "./tabular";

const MESSY = `Patient Name,DOB,visit_date,Patient Age,systolic_mmhg,clinic,notes
Jane Doe,1951-04-02,2024-03-14,93,142,Mass General Hospital,"Seen by Dr. Patel; call 617-555-0142 or jane.doe@gmail.com"
Jane Doe,1951-04-02,03/21/2024,93,138,Mass General Hospital,"Daughter Sarah Doe drove her in. Next visit March 28, 2024"
Jane Doe,1951-04-02,28-Mar-2024,93,135,Mass General Hospital,"MRN 00482913, lives at 42 Elm Street Boston MA 02134, SSN 123456789, cell 6175550142"
Jane Doe,1951-04-02,2024-04-02,93,131,Mass General Hospital,"Feeling OK today, walked 20 minutes"`;

const SHIFT = 30;

const deid = (csv: string, redactor?: NarrativeRedactor) => profileAndDeidentify(parseCsv(csv), SHIFT, redactor);
const column = (csv: string, name: string) => {
  const [header, ...rows] = parseCsv(csv);
  const i = header!.indexOf(name);
  return i === -1 ? null : rows.map((r) => r[i]!);
};

describe("normalizeHeader", () => {
  it("normalizes spacing, case, and camelCase", () => {
    assert.equal(normalizeHeader("Patient Name"), "patient_name");
    assert.equal(normalizeHeader("patient-name"), "patient_name");
    assert.equal(normalizeHeader("PatientName"), "patient_name");
    assert.equal(normalizeHeader(" Date of Birth "), "date_of_birth");
  });
});

describe("parseDate", () => {
  for (const [input, expected] of [
    ["2024-03-14", "2024-03-14"],
    ["2024-03-14T08:30:00Z", "2024-03-14"],
    ["2024/3/4", "2024-03-04"],
    ["03/21/2024", "2024-03-21"],
    ["3/21/24", "2024-03-21"],
    ["28-Mar-2024", "2024-03-28"],
    ["28 March 2024", "2024-03-28"],
    ["March 28, 2024", "2024-03-28"],
    ["Mar 3rd 2024", "2024-03-03"],
  ] as const) {
    it(`reads ${input}`, () => assert.equal(parseDate(input)?.toISOString().slice(0, 10), expected));
  }
  it("rejects impossible dates and non-dates", () => {
    assert.equal(parseDate("2024-02-31"), null);
    assert.equal(parseDate("142"), null);
    assert.equal(parseDate("rest"), null);
  });
});

describe("profileAndDeidentify on a messy file", () => {
  it("drops identifier columns even with spaced headers", async () => {
    const r = await deid(MESSY);
    for (const name of ["Patient Name", "DOB", "clinic"]) assert.equal(column(r.deidentifiedCsv, name), null, name);
    assert.doesNotMatch(r.deidentifiedCsv, /Jane|Doe|1951|Mass General/);
  });

  it("shifts every date even when formats are mixed", async () => {
    const r = await deid(MESSY);
    assert.deepEqual(column(r.deidentifiedCsv, "visit_date"), ["2024-04-13", "2024-04-20", "2024-04-27", "2024-05-02"]);
    assert.deepEqual(r.dateRange, { start: "2024-04-13", end: "2024-05-02" });
  });

  it("generalizes ages over 89 in any age column", async () => {
    const r = await deid(MESSY);
    assert.deepEqual(column(r.deidentifiedCsv, "Patient Age"), ["90+", "90+", "90+", "90+"]);
  });

  it("drops free-text notes when no redactor is available", async () => {
    const r = await deid(MESSY);
    assert.equal(column(r.deidentifiedCsv, "notes"), null);
    assert.ok(r.removedIdentifiers.includes("free-text notes"));
    assert.deepEqual(r.residualFindings, []);
  });

  it("drops notes when the redactor fails", async () => {
    const r = await deid(MESSY, async () => null);
    assert.equal(column(r.deidentifiedCsv, "notes"), null);
  });

  it("keeps notes with a redactor and scrubs everything around it", async () => {
    // Simulates the model catching "Sarah"; "Doe" must be caught from the dropped name column.
    const redactor: NarrativeRedactor = async (texts) => texts.map((t) => t.replace(/\bSarah\b/g, "[name]"));
    const r = await deid(MESSY, redactor);
    const notes = column(r.deidentifiedCsv, "notes")!.join("\n");

    assert.doesNotMatch(notes, /Sarah|Doe|Patel|617|jane\.doe|00482913|Elm|Boston|02134|123456789|6175550142/);
    assert.match(notes, /Next visit 2024-04-27/, "dates in text are shifted, not just removed");
    assert.match(notes, /Feeling OK today, walked 20 minutes/, "ordinary prose is untouched");
    assert.deepEqual(r.residualFindings, []);
  });
});

describe("profileAndDeidentify on clean sample data", () => {
  const dir = path.join(process.cwd(), "sample-data");
  let files: string[] = [];
  try {
    files = ["heart_rate_hrv_log.csv", "blood_pressure_log.csv", "blood_panel_results.csv", "medication_history.csv"];
    readFileSync(path.join(dir, files[0]!));
  } catch {
    files = [];
  }

  for (const file of files) {
    it(`${file}: keeps every row and shifts dates`, async () => {
      const csv = readFileSync(path.join(dir, file), "utf8");
      const r = await deid(csv, async (t) => t);
      assert.equal(r.rowCount, parseCsv(csv).length - 1);
      assert.deepEqual(r.residualFindings, []);
      assert.ok(r.columns.some((c) => c.type === "date"), "has a date column");
      assert.ok(r.dateRange, "has a shifted date range");
    });
  }
});

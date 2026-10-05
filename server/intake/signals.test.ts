import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import type { BountyCriteria, DataProfile } from "@/lib/data-profile";
import { categoryFor, detectSignals } from "@/lib/signals";
import { matchesCriteria } from "@/server/criteria";
import { analyzeUpload } from "./analyze";

describe("detectSignals", () => {
  it("matches column names regardless of case, underscores, and units", () => {
    assert.deepEqual(detectSignals(["systolic_mmhg", "Diastolic-mmHg", "pulse_bpm"]), ["systolic_bp", "diastolic_bp", "heart_rate"]);
    assert.deepEqual(detectSignals(["hrv_rmssd_ms"]), ["hrv"]);
  });

  it("matches synonyms in values", () => {
    assert.deepEqual(detectSignals(["Hemoglobin A1c"]).filter((s) => s === "hba1c"), ["hba1c"]);
    assert.ok(detectSignals(["Glycated hemoglobin"]).includes("hba1c"));
  });

  it("uses word boundaries", () => {
    assert.deepEqual(detectSignals(["salt intake", "halt", "pastry"]), [], "alt/ast must not match inside words");
  });

  it("picks the dominant category", () => {
    assert.equal(categoryFor(["systolic_bp", "diastolic_bp", "heart_rate", "sleep"]), "vitals");
    assert.equal(categoryFor([]), "other");
  });
});

const dir = path.join(process.cwd(), "sample-data");
const sample = (file: string) => readFileSync(path.join(dir, file));
const analyze = (file: string) => analyzeUpload({ body: sample(file), fileName: file, contentType: "text/csv", dateShiftDays: 10 });

describe("analyzeUpload tags sample files deterministically", { skip: !existsSync(dir) }, () => {
  const expectations: [string, string, string[]][] = [
    ["blood_panel_results.csv", "lab_results", ["hba1c", "glucose", "ldl"]],
    ["blood_pressure_log.csv", "vitals", ["systolic_bp", "diastolic_bp"]],
    ["heart_rate_hrv_log.csv", "wearable", ["hrv", "steps"]],
    ["long_covid_symptom_diary.csv", "conditions", ["fatigue", "brain_fog", "long_covid"]],
    ["medication_history.csv", "medications", ["medications", "side_effects"]],
    ["skincare_routine_log.csv", "other", ["skin"]],
  ];
  for (const [file, category, signals] of expectations) {
    it(file, async () => {
      const { profile, deidentified } = await analyze(file);
      assert.equal(profile.category, category);
      for (const s of signals) assert.ok(profile.signals?.includes(s), `${file} should have ${s}; got ${profile.signals}`);
      assert.equal(profile.analyzer, "local");
      assert.ok(deidentified, "is shareable");
    });
  }

  it("is stable across runs", async () => {
    const a = await analyze("blood_panel_results.csv");
    const b = await analyze("blood_panel_results.csv");
    assert.deepEqual(a.profile, b.profile);
  });
});

describe("matchesCriteria", () => {
  const profile = (overrides: Partial<DataProfile>): DataProfile => ({
    title: "Lab results",
    summary: "",
    category: "lab_results",
    documentType: "Lab results",
    source: "spreadsheet",
    signals: ["hba1c", "glucose"],
    tags: ["HbA1c", "Glucose"],
    columns: [{ name: "test_name", type: "text", nonEmpty: 10 }],
    rowCount: 10,
    dateRange: null,
    spanDays: 90,
    removedIdentifiers: [],
    suitableFor: [],
    estimatedValueUsdc: 0,
    analyzer: "local",
    ...overrides,
  });
  const criteria = (overrides: Partial<BountyCriteria>): BountyCriteria => ({
    categories: [],
    requiredSignals: [],
    minRows: 0,
    minSpanDays: 0,
    ...overrides,
  });

  it("requires every signal id", () => {
    assert.ok(matchesCriteria(criteria({ requiredSignals: ["hba1c"] }), profile({})));
    assert.ok(!matchesCriteria(criteria({ requiredSignals: ["hba1c", "ldl"] }), profile({})));
  });

  it("finds values that aren't column names (the old HbA1c miss)", () => {
    assert.ok(!profile({}).columns.some((c) => c.name.includes("hba1c")));
    assert.ok(matchesCriteria(criteria({ requiredSignals: ["hba1c"] }), profile({})));
  });

  it("enforces category, rows, and history", () => {
    assert.ok(!matchesCriteria(criteria({ categories: ["vitals"] }), profile({})));
    assert.ok(!matchesCriteria(criteria({ minRows: 11 }), profile({})));
    assert.ok(!matchesCriteria(criteria({ minSpanDays: 91 }), profile({})));
  });

  it("falls back to keywords for legacy free-text signals and untagged profiles", () => {
    assert.ok(matchesCriteria(criteria({ requiredSignals: ["test name"] }), profile({})));
    assert.ok(matchesCriteria(criteria({ requiredSignals: ["hba1c"] }), profile({ signals: undefined, tags: ["hba1c"] })));
  });
});

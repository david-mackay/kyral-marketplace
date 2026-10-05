/**
 * Shared vocabulary for what health data contains. Uploads are tagged with
 * these ids and research requests require them, so matching is exact.
 */
export interface Signal {
  id: string;
  label: string;
  category: string;
  /** Lowercase phrases matched on word boundaries against column names, values, and file names. */
  synonyms: string[];
}

export const SIGNALS: Signal[] = [
  // Vitals
  { id: "systolic_bp", label: "Systolic BP", category: "vitals", synonyms: ["systolic", "sbp"] },
  { id: "diastolic_bp", label: "Diastolic BP", category: "vitals", synonyms: ["diastolic", "dbp"] },
  { id: "heart_rate", label: "Heart rate", category: "vitals", synonyms: ["heart rate", "resting hr", "hr bpm", "pulse", "pulse bpm", "resting heart rate"] },
  { id: "spo2", label: "Blood oxygen", category: "vitals", synonyms: ["spo2", "oxygen saturation", "o2 sat", "blood oxygen"] },
  { id: "temperature", label: "Body temperature", category: "vitals", synonyms: ["body temperature", "body temp", "temperature f", "temperature c", "temp f", "temp c"] },
  { id: "weight", label: "Weight", category: "vitals", synonyms: ["weight", "body weight", "weight kg", "weight lbs"] },
  { id: "bmi", label: "BMI", category: "vitals", synonyms: ["bmi", "body mass index"] },
  // Wearables
  { id: "hrv", label: "HRV", category: "wearable", synonyms: ["hrv", "rmssd", "sdnn", "heart rate variability"] },
  { id: "steps", label: "Steps", category: "wearable", synonyms: ["steps", "step count"] },
  { id: "sleep", label: "Sleep", category: "wearable", synonyms: ["sleep", "sleep hrs", "sleep hours", "sleep duration", "sleep quality", "sleep score", "deep sleep", "rem sleep"] },
  { id: "active_calories", label: "Active calories", category: "wearable", synonyms: ["calories active", "active calories", "calories", "kcal"] },
  { id: "exercise", label: "Exercise", category: "wearable", synonyms: ["exercise", "workout", "active minutes", "exercise mins", "activity tolerance"] },
  // Labs
  { id: "hba1c", label: "HbA1c", category: "lab_results", synonyms: ["hba1c", "a1c", "hemoglobin a1c", "glycated hemoglobin", "glycohemoglobin"] },
  { id: "glucose", label: "Glucose", category: "lab_results", synonyms: ["glucose", "blood sugar", "fasting glucose"] },
  { id: "ldl", label: "LDL cholesterol", category: "lab_results", synonyms: ["ldl", "ldl cholesterol", "ldl c"] },
  { id: "hdl", label: "HDL cholesterol", category: "lab_results", synonyms: ["hdl", "hdl cholesterol", "hdl c"] },
  { id: "total_cholesterol", label: "Total cholesterol", category: "lab_results", synonyms: ["total cholesterol", "cholesterol total"] },
  { id: "triglycerides", label: "Triglycerides", category: "lab_results", synonyms: ["triglycerides", "triglyceride"] },
  { id: "kidney_function", label: "Kidney function", category: "lab_results", synonyms: ["creatinine", "egfr", "bun", "blood urea nitrogen"] },
  { id: "liver_enzymes", label: "Liver enzymes", category: "lab_results", synonyms: ["alt", "ast", "sgpt", "sgot", "alanine aminotransferase", "aspartate aminotransferase"] },
  { id: "thyroid", label: "Thyroid (TSH)", category: "lab_results", synonyms: ["tsh", "thyroid stimulating hormone", "free t4", "t4"] },
  { id: "vitamin_d", label: "Vitamin D", category: "lab_results", synonyms: ["vitamin d", "25 oh vitamin d", "25 hydroxy"] },
  { id: "inflammation", label: "Inflammation (CRP)", category: "lab_results", synonyms: ["crp", "hs crp", "c reactive protein", "esr"] },
  { id: "blood_counts", label: "Blood counts", category: "lab_results", synonyms: ["cbc", "wbc", "rbc", "white blood cell", "platelets", "hematocrit", "hemoglobin"] },
  { id: "iron", label: "Iron / ferritin", category: "lab_results", synonyms: ["ferritin", "iron", "transferrin"] },
  // Medications
  { id: "medications", label: "Medication history", category: "medications", synonyms: ["medication", "medications", "dose", "dosage", "prescription", "prescribing reason"] },
  { id: "side_effects", label: "Side effects", category: "medications", synonyms: ["side effects", "side effect", "adverse event", "adverse events"] },
  // Conditions and symptoms
  { id: "fatigue", label: "Fatigue", category: "conditions", synonyms: ["fatigue", "tiredness", "energy level"] },
  { id: "brain_fog", label: "Brain fog", category: "conditions", synonyms: ["brain fog", "cognitive", "concentration"] },
  { id: "pain", label: "Pain", category: "conditions", synonyms: ["pain", "pain level"] },
  { id: "mood", label: "Mood", category: "conditions", synonyms: ["mood", "depression", "anxiety", "phq 9", "gad 7", "stress level"] },
  { id: "headache", label: "Headache / migraine", category: "conditions", synonyms: ["headache", "migraine"] },
  { id: "long_covid", label: "Long COVID", category: "conditions", synonyms: ["long covid", "post covid", "pasc", "covid", "pcr positive"] },
  // Other
  { id: "skin", label: "Skin condition", category: "other", synonyms: ["acne", "eczema", "redness", "dryness", "skin type", "fitzpatrick", "rash"] },
  { id: "diet", label: "Diet", category: "other", synonyms: ["diet", "meal", "dairy", "sugar high", "sodium", "water intake", "carbs"] },
  { id: "alcohol", label: "Alcohol", category: "other", synonyms: ["alcohol", "alcohol units", "drinks"] },
  { id: "menstrual", label: "Menstrual cycle", category: "other", synonyms: ["menstrual", "menstrual phase", "cycle day", "luteal", "follicular", "ovulation"] },
  { id: "genotype", label: "Genotype", category: "genomics", synonyms: ["genotype", "rsid", "allele", "snp"] },
  { id: "imaging", label: "Imaging", category: "imaging", synonyms: ["mri", "ct scan", "x ray", "ultrasound", "radiology"] },
];

export const SIGNAL_IDS = new Set(SIGNALS.map((s) => s.id));
const BY_ID = new Map(SIGNALS.map((s) => [s.id, s]));

export function signalLabel(id: string) {
  return BY_ID.get(id)?.label ?? id;
}

export function signalCategory(id: string) {
  return BY_ID.get(id)?.category;
}

/** "systolic_mmhg" / "Systolic-BP" → " systolic mmhg " with padding for word-boundary checks. */
function normalize(text: string) {
  return ` ${text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

const COMPILED = SIGNALS.map((s) => ({ id: s.id, needles: s.synonyms.map((syn) => normalize(syn)) }));

/** Signal ids present in any of the given texts, in vocabulary order. */
export function detectSignals(texts: string[]): string[] {
  const haystack = texts.map(normalize).join("|");
  return COMPILED.filter(({ needles }) => needles.some((n) => haystack.includes(n))).map((s) => s.id);
}

/** The category most of the signals belong to; "mixed" when no category dominates. */
export function categoryFor(signalIds: string[], fallback = "other"): string {
  const counts = new Map<string, number>();
  for (const id of signalIds) {
    const category = BY_ID.get(id)?.category;
    if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return fallback;
  if (ranked.length >= 3 && ranked[0]![1] === ranked[1]![1]) return "mixed";
  return ranked[0]![0];
}

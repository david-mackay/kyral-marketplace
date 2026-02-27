import { z } from "zod";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  return key;
}

export const DatasetPlanSchema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.enum([
    "vitals",
    "lab_results",
    "demographics",
    "medications",
    "conditions",
    "imaging",
    "genomics",
    "wearable",
    "mixed",
    "other",
  ]),
  suggestedPriceUsdc: z.number(),
  dataRequirements: z.array(z.string()),
  targetDemographics: z.array(z.string()),
  scientificValue: z.string(),
  suggestedBiomarkers: z.array(z.string()),
  estimatedSampleSize: z.string(),
});

export type DatasetPlan = z.infer<typeof DatasetPlanSchema>;

const SYSTEM_PROMPT = `You are a BioAgents-powered scientific dataset planner for Kyral, a decentralized health data marketplace. Researchers create dataset requests and individuals contribute their health records.

Your job: given a research topic or question, produce a structured dataset collection plan that helps a researcher create a compelling, well-specified dataset listing on the marketplace.

You MUST respond with valid JSON matching this exact schema (no markdown, no code fences):
{
  "title": "A concise, compelling dataset title (max 100 chars)",
  "description": "A 2-3 paragraph description explaining the dataset's purpose, what data contributors should provide, and how it will advance research. Written to attract data contributors.",
  "category": one of: "vitals", "lab_results", "demographics", "medications", "conditions", "imaging", "genomics", "wearable", "mixed", "other",
  "suggestedPriceUsdc": a number (whole dollars, reasonable for the data type — typically 5-100),
  "dataRequirements": ["list of specific data fields/types contributors should include"],
  "targetDemographics": ["who should contribute — age ranges, conditions, etc."],
  "scientificValue": "1-2 sentences on why this data matters to science",
  "suggestedBiomarkers": ["specific biomarkers or measurements relevant to this study"],
  "estimatedSampleSize": "recommended minimum sample size with brief justification"
}

Guidelines:
- Be scientifically rigorous but accessible to non-experts
- Suggest realistic prices based on data sensitivity and collection burden
- Always consider participant privacy
- Focus on data that individuals would plausibly have (lab results, wearable exports, vitals, etc.)`;

export async function generateDatasetPlan(
  researchTopic: string,
): Promise<DatasetPlan> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://kyral.xyz",
      "X-Title": "Kyral Marketplace",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-001",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Design a health dataset collection plan for the following research topic:\n\n${researchTopic}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";

  const jsonStr = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  const parsed = JSON.parse(jsonStr);
  return DatasetPlanSchema.parse(parsed);
}

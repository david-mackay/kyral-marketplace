/**
 * Format USDC amount from smallest unit (6 decimals) to display string.
 */
export function formatUsdc(amountSmallestUnit: number): string {
  const usdc = amountSmallestUnit / 1_000_000;
  if (usdc >= 1000) {
    return `$${(usdc / 1000).toFixed(1)}k`;
  }
  if (usdc >= 1) {
    return `$${usdc.toFixed(2)}`;
  }
  return `$${usdc.toFixed(4)}`;
}

/**
 * Format wallet address for display.
 */
export function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Format a date for display.
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Category labels for display.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  vitals: "Vitals",
  lab_results: "Lab Results",
  demographics: "Demographics",
  medications: "Medications",
  conditions: "Conditions",
  imaging: "Imaging",
  genomics: "Genomics",
  wearable: "Wearable",
  mixed: "Mixed",
  other: "Other",
};

export const DATA_CATEGORIES = Object.keys(CATEGORY_LABELS);

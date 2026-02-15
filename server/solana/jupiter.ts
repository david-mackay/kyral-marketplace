import { getJupiterApiKey, getUsdcMint } from "./config";

const JUPITER_BASE_URL = "https://api.jup.ag";

function getHeaders() {
  const apiKey = getJupiterApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

/**
 * Get a swap order from Jupiter Ultra API.
 * Swaps from any token to USDC.
 */
export async function getSwapOrder(args: {
  inputMint: string;
  amount: string; // in input token's smallest unit
  takerWallet: string;
}) {
  const params = new URLSearchParams({
    inputMint: args.inputMint,
    outputMint: getUsdcMint(),
    amount: args.amount,
    taker: args.takerWallet,
  });

  const res = await fetch(
    `${JUPITER_BASE_URL}/ultra/v1/order?${params.toString()}`,
    { headers: getHeaders() }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `Jupiter order failed: ${res.status} ${JSON.stringify(body)}`
    );
  }

  return res.json();
}

/**
 * Execute a signed swap order via Jupiter Ultra API.
 */
export async function executeSwapOrder(args: {
  signedTransaction: string; // base64
  requestId: string;
}) {
  const res = await fetch(`${JUPITER_BASE_URL}/ultra/v1/execute`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      signedTransaction: args.signedTransaction,
      requestId: args.requestId,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `Jupiter execute failed: ${res.status} ${JSON.stringify(body)}`
    );
  }

  return res.json();
}

/**
 * Get token price in USD from Jupiter Price API.
 */
export async function getTokenPrice(mintAddress: string): Promise<number | null> {
  const res = await fetch(
    `${JUPITER_BASE_URL}/price/v3?ids=${mintAddress}`,
    { headers: getHeaders() }
  );

  if (!res.ok) return null;

  const data = await res.json();
  return data?.data?.[mintAddress]?.price ?? null;
}

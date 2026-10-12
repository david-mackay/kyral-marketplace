import type { NextRequest } from "next/server";
import { getAddress, isAddress, isHex } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";

import { monadChain } from "@/lib/chain";
import { getPublicClient } from "@/server/monad/config";

export const SIWE_NONCE_COOKIE = "kyral_siwe_nonce";
export const SIWE_TTL_SECONDS = 5 * 60;

export function requestOrigin(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return { host, origin: `${proto}://${host}` };
}

/**
 * Verifies a Sign-In with Ethereum signature: the message must be for this
 * host, this chain, the nonce we issued, and still be unexpired. Smart-account
 * wallets (ERC-1271 / ERC-6492, e.g. Reown email and social logins) are
 * verified against the chain.
 * Returns the checksummed wallet address if valid, null otherwise.
 */
export async function verifyWalletAuthSignature(
  req: NextRequest,
  walletAddress: string,
  message: string,
  signature: string
): Promise<string | null> {
  try {
    const nonce = req.cookies.get(SIWE_NONCE_COOKIE)?.value;
    if (!nonce || !isAddress(walletAddress) || !isHex(signature)) return null;
    const address = getAddress(walletAddress);

    const parsed = parseSiweMessage(message);
    const valid =
      parsed.chainId === monadChain.id &&
      validateSiweMessage({ message: parsed, address, domain: requestOrigin(req).host, nonce });
    if (!valid) return null;

    const isValid = await getPublicClient().verifyMessage({ address, message, signature });
    return isValid ? address : null;
  } catch {
    return null;
  }
}

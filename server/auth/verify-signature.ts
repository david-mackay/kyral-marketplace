import { getAddress, isAddress, isHex } from "viem";

import { getPublicClient } from "@/server/monad/config";

const MESSAGE_REGEX =
  /^Sign in to Kyral Marketplace\n\nTimestamp: (\d+)\nNonce: ([a-f0-9]+)$/;
const MAX_AGE_SECONDS = 5 * 60; // 5 minutes

/**
 * Verifies an EIP-191 personal_sign signature for auth. Smart-account wallets
 * (ERC-1271 / ERC-6492, e.g. Reown email and social logins) are verified
 * against the chain.
 * Returns the checksummed wallet address if valid, null otherwise.
 */
export async function verifyWalletAuthSignature(
  walletAddress: string,
  message: string,
  signature: string
): Promise<string | null> {
  try {
    const match = message.match(MESSAGE_REGEX);
    if (!match) return null;

    const [, timestampStr] = match;
    const timestamp = parseInt(timestampStr ?? "0", 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - timestamp > MAX_AGE_SECONDS || timestamp > now + 60) {
      return null;
    }

    if (!isAddress(walletAddress) || !isHex(signature)) return null;
    const address = getAddress(walletAddress);

    const isValid = await getPublicClient().verifyMessage({
      address,
      message,
      signature,
    });

    return isValid ? address : null;
  } catch {
    return null;
  }
}

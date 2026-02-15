import nacl from "tweetnacl";
import bs58 from "bs58";

const MESSAGE_REGEX =
  /^Sign in to Kyral Marketplace\n\nTimestamp: (\d+)\nNonce: ([a-f0-9]+)$/;
const MAX_AGE_SECONDS = 5 * 60; // 5 minutes

/**
 * Verifies a Solana Ed25519 signature for auth.
 * Returns the wallet address if valid, null otherwise.
 */
export function verifySolanaAuthSignature(
  walletAddress: string,
  message: string,
  signatureBase64: string
): string | null {
  try {
    const match = message.match(MESSAGE_REGEX);
    if (!match) return null;

    const [, timestampStr] = match;
    const timestamp = parseInt(timestampStr ?? "0", 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - timestamp > MAX_AGE_SECONDS || timestamp > now + 60) {
      return null;
    }

    const publicKey = bs58.decode(walletAddress);
    if (publicKey.length !== 32) return null;

    const signature = Buffer.from(signatureBase64, "base64");
    if (signature.length !== 64) return null;

    const messageBytes = new TextEncoder().encode(message);

    const isValid = nacl.sign.detached.verify(
      messageBytes,
      new Uint8Array(signature),
      new Uint8Array(publicKey)
    );

    return isValid ? walletAddress : null;
  } catch {
    return null;
  }
}

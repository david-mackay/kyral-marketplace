import { PrivyClient } from "@privy-io/node";
import { getAddress, isAddress, isAddressEqual } from "viem";

let client: PrivyClient | null = null;

function privy() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) throw new Error("NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET must be set");
  client ??= new PrivyClient({ appId, appSecret });
  return client;
}

/**
 * Resolve a Privy login to one of the user's wallets. The access token proves
 * who is signed in; the wallet must be linked to that Privy user (their
 * embedded wallet, or an external wallet Privy verified with a signature).
 * Returns the checksummed address, or null if the token or wallet don't check out.
 */
export async function verifyPrivyWallet(accessToken: string, walletAddress: string): Promise<string | null> {
  if (!isAddress(walletAddress)) return null;
  try {
    const { user_id } = await privy().utils().auth().verifyAccessToken(accessToken);
    const user = await privy().users()._get(user_id);
    const linked = user.linked_accounts.some(
      (a) =>
        a.type === "wallet" &&
        "chain_type" in a &&
        a.chain_type === "ethereum" &&
        isAddressEqual(a.address as `0x${string}`, walletAddress)
    );
    return linked ? getAddress(walletAddress) : null;
  } catch {
    return null;
  }
}

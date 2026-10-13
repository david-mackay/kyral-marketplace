import {
  createPublicClient,
  createWalletClient,
  http,
  nonceManager,
  type Hex,
} from "viem";
import { privateKeyToAccount, type LocalAccount } from "viem/accounts";
import { PrivyClient } from "@privy-io/node";
import { createViemAccount } from "@privy-io/node/viem";

import { monadChain } from "@/lib/chain";

const transport = () =>
  http(process.env.MONAD_RPC_URL ?? monadChain.rpcUrls.default.http[0]);

let cachedPublicClient: ReturnType<typeof createPublicClient> | null = null;

export function getPublicClient() {
  cachedPublicClient ??= createPublicClient({
    chain: monadChain,
    transport: transport(),
  });
  return cachedPublicClient;
}

let cachedOperatorClient: ReturnType<typeof buildOperatorClient> | null = null;

/**
 * The operator is a Privy server wallet. Our key is only an additional signer
 * bound to a policy that allows Kyral's operator calls on Monad and nothing
 * else (no transfers, no key export); the wallet's owner key is kept offline.
 * A raw OPERATOR_PRIVATE_KEY is still accepted for local setups without Privy.
 */
function operatorAccount(): LocalAccount {
  const walletId = process.env.PRIVY_OPERATOR_WALLET_ID;
  const address = process.env.PRIVY_OPERATOR_ADDRESS;
  const authKey = process.env.PRIVY_OPERATOR_AUTH_KEY;
  if (walletId && address && authKey) {
    const privy = new PrivyClient({ appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!, appSecret: process.env.PRIVY_APP_SECRET! });
    const account = createViemAccount(privy, {
      walletId,
      address: address as Hex,
      authorizationContext: { authorization_private_keys: [authKey] },
    });
    // nonceManager serializes nonces across concurrent requests in this process.
    return { ...account, nonceManager } as LocalAccount;
  }
  const privateKey = process.env.OPERATOR_PRIVATE_KEY;
  if (!privateKey) throw new Error("Set PRIVY_OPERATOR_WALLET_ID (or OPERATOR_PRIVATE_KEY for local use)");
  return privateKeyToAccount(privateKey as Hex, { nonceManager });
}

function buildOperatorClient() {
  return createWalletClient({ account: operatorAccount(), chain: monadChain, transport: transport() });
}

/**
 * Wallet that registers catalog items and relays claims. It pays gas only;
 * it never holds user funds.
 */
export function getOperatorClient() {
  cachedOperatorClient ??= buildOperatorClient();
  return cachedOperatorClient;
}

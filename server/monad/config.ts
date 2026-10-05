import {
  createPublicClient,
  createWalletClient,
  http,
  nonceManager,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

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

function buildOperatorClient() {
  const privateKey = process.env.OPERATOR_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("OPERATOR_PRIVATE_KEY is not set");
  }
  // nonceManager serializes nonces across concurrent requests in this process.
  const account = privateKeyToAccount(privateKey as Hex, { nonceManager });
  return createWalletClient({ account, chain: monadChain, transport: transport() });
}

/**
 * Wallet that registers catalog items and relays claims. It pays gas only;
 * it never holds user funds.
 */
export function getOperatorClient() {
  cachedOperatorClient ??= buildOperatorClient();
  return cachedOperatorClient;
}

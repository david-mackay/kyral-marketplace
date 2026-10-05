import { defineChain, keccak256, toBytes, type Address, type Hex } from "viem";

const rpcUrl =
  process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";

export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://testnet.monadvision.com";

export const monadChain = defineChain({
  id: 10_143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Testnet MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: { default: { name: "MonadVision", url: EXPLORER_URL } },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
  testnet: true,
});

export const MARKETPLACE_ADDRESS = (process.env
  .NEXT_PUBLIC_MARKETPLACE_ADDRESS ?? "0x") as Address;

export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
  "0x") as Address;

/** True when USDC is the TestUSDC contract, which exposes a public faucet. */
export const USDC_HAS_FAUCET = process.env.NEXT_PUBLIC_USDC_FAUCET === "true";

export type ItemType = "listing" | "dataset";

export function itemIdFor(type: ItemType, id: string): Hex {
  return keccak256(toBytes(`kyral:${type}:${id}`));
}

export function purchaseRefFor(purchaseId: string): Hex {
  return keccak256(toBytes(`kyral:purchase:${purchaseId}`));
}

export function txUrl(hash: string) {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function addressUrl(address: string) {
  return `${EXPLORER_URL}/address/${address}`;
}

import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";

let cachedConnection: Connection | null = null;

export function getConnection(): Connection {
  if (cachedConnection) return cachedConnection;
  const rpcUrl =
    process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  cachedConnection = new Connection(rpcUrl, "confirmed");
  return cachedConnection;
}

let cachedEscrowKeypair: Keypair | null = null;

export function getEscrowKeypair(): Keypair {
  if (cachedEscrowKeypair) return cachedEscrowKeypair;
  const privateKey = process.env.ESCROW_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("ESCROW_WALLET_PRIVATE_KEY is not set");
  }
  cachedEscrowKeypair = Keypair.fromSecretKey(bs58.decode(privateKey));
  return cachedEscrowKeypair;
}

export function getUsdcMint(): string {
  return (
    process.env.NEXT_PUBLIC_USDC_MINT ??
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  );
}

export function getPlatformFeeBps(): number {
  return parseInt(process.env.PLATFORM_FEE_BPS ?? "500", 10); // 5% default
}

export function getJupiterApiKey(): string {
  return process.env.JUPITER_API_KEY ?? "";
}

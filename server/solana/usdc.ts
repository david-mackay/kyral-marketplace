import {
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { getConnection, getEscrowKeypair, getUsdcMint } from "./config";

const USDC_DECIMALS = 6;

/**
 * Convert a human-readable USDC amount to the smallest unit (6 decimals).
 */
export function usdcToSmallestUnit(amount: number): number {
  return Math.round(amount * 10 ** USDC_DECIMALS);
}

/**
 * Convert smallest unit to human-readable USDC.
 */
export function smallestUnitToUsdc(amount: number): number {
  return amount / 10 ** USDC_DECIMALS;
}

/**
 * Get the escrow wallet's USDC token account address.
 */
export async function getEscrowUsdcAddress(): Promise<PublicKey> {
  const escrow = getEscrowKeypair();
  const usdcMint = new PublicKey(getUsdcMint());
  return getAssociatedTokenAddress(usdcMint, escrow.publicKey);
}

/**
 * Verify a USDC transfer transaction on-chain.
 * Waits for confirmation before inspecting the transaction.
 */
export async function verifyUsdcTransfer(args: {
  txSignature: string;
  expectedFromWallet: string;
  expectedAmountUsdc: number; // smallest units
}): Promise<{ verified: boolean; actualAmount: number }> {
  const connection = getConnection();

  // Wait for the transaction to be confirmed on-chain before checking
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  try {
    await connection.confirmTransaction(
      {
        signature: args.txSignature,
        blockhash,
        lastValidBlockHeight,
      },
      "confirmed"
    );
  } catch {
    return { verified: false, actualAmount: 0 };
  }

  // Now fetch the confirmed transaction details
  const tx = await connection.getTransaction(args.txSignature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!tx || tx.meta?.err) {
    return { verified: false, actualAmount: 0 };
  }

  return { verified: true, actualAmount: args.expectedAmountUsdc };
}

/**
 * Send USDC from the escrow wallet to a recipient.
 * Returns the transaction signature.
 */
export async function sendUsdcFromEscrow(args: {
  recipientWallet: string;
  amountSmallestUnit: number;
}): Promise<string> {
  const connection = getConnection();
  const escrow = getEscrowKeypair();
  const usdcMint = new PublicKey(getUsdcMint());
  const recipientPubkey = new PublicKey(args.recipientWallet);

  const escrowAta = await getAssociatedTokenAddress(
    usdcMint,
    escrow.publicKey
  );
  const recipientAta = await getAssociatedTokenAddress(
    usdcMint,
    recipientPubkey
  );

  const transaction = new Transaction();

  // Check if recipient ATA exists, create if not
  try {
    await getAccount(connection, recipientAta);
  } catch {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        escrow.publicKey,
        recipientAta,
        recipientPubkey,
        usdcMint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  transaction.add(
    createTransferInstruction(
      escrowAta,
      recipientAta,
      escrow.publicKey,
      args.amountSmallestUnit,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = escrow.publicKey;

  transaction.sign(escrow);

  const signature = await connection.sendRawTransaction(
    transaction.serialize()
  );
  await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  });

  return signature;
}

"use client";

import {
  PublicKey,
  Transaction,
  Connection,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

/**
 * Build a USDC SPL token transfer transaction (unsigned).
 * Creates the recipient ATA if it doesn't exist (sender pays for it).
 */
export async function buildUsdcTransferTransaction(args: {
  connection: Connection;
  senderAddress: string;
  recipientAddress: string;
  amountSmallestUnit: number; // USDC has 6 decimals
  usdcMint: string;
}) {
  const sender = new PublicKey(args.senderAddress);
  const recipient = new PublicKey(args.recipientAddress);
  const mint = new PublicKey(args.usdcMint);

  const senderAta = await getAssociatedTokenAddress(mint, sender);
  const recipientAta = await getAssociatedTokenAddress(mint, recipient);

  const transaction = new Transaction();

  // Check if recipient ATA exists; if not, add instruction to create it
  const recipientAtaInfo = await args.connection.getAccountInfo(recipientAta);
  if (!recipientAtaInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        sender, // payer
        recipientAta,
        recipient,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  transaction.add(
    createTransferInstruction(
      senderAta,
      recipientAta,
      sender,
      args.amountSmallestUnit,
      []
    )
  );

  const { blockhash, lastValidBlockHeight } =
    await args.connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = sender;

  return transaction;
}

"use client";

import {
  getBytecode,
  readContract,
  signTypedData,
  switchChain,
  waitForTransactionReceipt,
  writeContract,
  getChainId,
} from "wagmi/actions";
import { erc20Abi, hexToSignature, type Address, type Hex } from "viem";
import type { Config } from "wagmi";

import { kyralMarketplaceAbi } from "@/lib/abi/kyral-marketplace";
import { testUsdcAbi } from "@/lib/abi/test-usdc";
import { monadChain } from "@/lib/chain";

export interface PurchaseQuote {
  amountUsdc: number;
  itemId: Hex;
  purchaseRef: Hex;
  marketplaceAddress: Address;
  usdcAddress: Address;
}

const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

async function permitDomain(config: Config, token: Address) {
  try {
    const [, name, version, chainId, verifyingContract] = await readContract(config, {
      address: token,
      abi: testUsdcAbi,
      functionName: "eip712Domain",
    });
    return { name, version, chainId: Number(chainId), verifyingContract };
  } catch {
    // Circle USDC predates ERC-5267 and exposes name() / version() instead.
    const [name, version] = await Promise.all([
      readContract(config, { address: token, abi: erc20Abi, functionName: "name" }),
      readContract(config, {
        address: token,
        abi: [{ type: "function", name: "version", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }],
        functionName: "version",
      }).catch(() => "2"),
    ]);
    return { name, version, chainId: monadChain.id, verifyingContract: token };
  }
}

async function purchaseWithPermit(config: Config, account: Address, quote: PurchaseQuote, price: bigint) {
  const domain = await permitDomain(config, quote.usdcAddress);
  const nonce = await readContract(config, {
    address: quote.usdcAddress,
    abi: testUsdcAbi,
    functionName: "nonces",
    args: [account],
  });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

  const signature = await signTypedData(config, {
    account,
    domain,
    types: PERMIT_TYPES,
    primaryType: "Permit",
    message: { owner: account, spender: quote.marketplaceAddress, value: price, nonce, deadline },
  });
  const { v, r, s } = hexToSignature(signature);

  return writeContract(config, {
    account,
    address: quote.marketplaceAddress,
    abi: kyralMarketplaceAbi,
    functionName: "purchaseWithPermit",
    args: [quote.itemId, price, quote.purchaseRef, deadline, Number(v), r, s],
  });
}

async function purchaseWithApproval(config: Config, account: Address, quote: PurchaseQuote, price: bigint) {
  const allowance = await readContract(config, {
    address: quote.usdcAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account, quote.marketplaceAddress],
  });

  if (allowance < price) {
    const approveHash = await writeContract(config, {
      account,
      address: quote.usdcAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [quote.marketplaceAddress, price],
    });
    await waitForTransactionReceipt(config, { hash: approveHash });
  }

  return writeContract(config, {
    account,
    address: quote.marketplaceAddress,
    abi: kyralMarketplaceAbi,
    functionName: "purchase",
    args: [quote.itemId, price, quote.purchaseRef],
  });
}

/**
 * Pay the KyralMarketplace contract for a quoted item and wait for inclusion.
 * EOAs sign a single EIP-2612 permit; smart accounts fall back to approve.
 */
export async function payForItem(config: Config, account: Address, quote: PurchaseQuote): Promise<Hex> {
  if (getChainId(config) !== monadChain.id) {
    await switchChain(config, { chainId: monadChain.id });
  }

  const price = BigInt(quote.amountUsdc);
  const balance = await readContract(config, {
    address: quote.usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
  if (balance < price) {
    throw new Error("Not enough USDC in your wallet for this purchase.");
  }

  const code = await getBytecode(config, { address: account });
  const isSmartAccount = !!code && code !== "0x";

  const txHash = isSmartAccount
    ? await purchaseWithApproval(config, account, quote, price)
    : await purchaseWithPermit(config, account, quote, price).catch((error: unknown) => {
        // User rejection should not trigger a second prompt.
        if (error instanceof Error && /reject|denied/i.test(error.message)) throw error;
        return purchaseWithApproval(config, account, quote, price);
      });

  const receipt = await waitForTransactionReceipt(config, { hash: txHash });
  if (receipt.status !== "success") {
    throw new Error("Purchase transaction reverted.");
  }
  return txHash;
}

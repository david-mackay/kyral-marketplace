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

interface Payment {
  token: Address;
  spender: Address;
  amount: bigint;
  withPermit: (deadline: bigint, v: number, r: Hex, s: Hex) => Promise<Hex>;
  withAllowance: () => Promise<Hex>;
}

async function payWithPermit(config: Config, account: Address, p: Payment) {
  const domain = await permitDomain(config, p.token);
  const nonce = await readContract(config, {
    address: p.token,
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
    message: { owner: account, spender: p.spender, value: p.amount, nonce, deadline },
  });
  const { v, r, s } = hexToSignature(signature);
  return p.withPermit(deadline, Number(v), r, s);
}

async function payWithApproval(config: Config, account: Address, p: Payment) {
  const allowance = await readContract(config, {
    address: p.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account, p.spender],
  });

  if (allowance < p.amount) {
    const approveHash = await writeContract(config, {
      account,
      address: p.token,
      abi: erc20Abi,
      functionName: "approve",
      args: [p.spender, p.amount],
    });
    await waitForTransactionReceipt(config, { hash: approveHash });
  }
  return p.withAllowance();
}

/**
 * Pull `amount` of USDC into the marketplace and wait for inclusion.
 * EOAs sign a single EIP-2612 permit; smart accounts fall back to approve.
 */
async function pay(config: Config, account: Address, p: Payment): Promise<Hex> {
  if (getChainId(config) !== monadChain.id) {
    await switchChain(config, { chainId: monadChain.id });
  }

  const balance = await readContract(config, {
    address: p.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
  if (balance < p.amount) {
    throw new Error("Not enough USDC in your account.");
  }

  const code = await getBytecode(config, { address: account });
  const isSmartAccount = !!code && code !== "0x";

  const txHash = isSmartAccount
    ? await payWithApproval(config, account, p)
    : await payWithPermit(config, account, p).catch((error: unknown) => {
        // User rejection should not trigger a second prompt.
        if (error instanceof Error && /reject|denied/i.test(error.message)) throw error;
        return payWithApproval(config, account, p);
      });

  const receipt = await waitForTransactionReceipt(config, { hash: txHash });
  if (receipt.status !== "success") {
    throw new Error("Transaction reverted.");
  }
  return txHash;
}

export function payForItem(config: Config, account: Address, quote: PurchaseQuote): Promise<Hex> {
  const price = BigInt(quote.amountUsdc);
  const base = { account, address: quote.marketplaceAddress, abi: kyralMarketplaceAbi } as const;
  return pay(config, account, {
    token: quote.usdcAddress,
    spender: quote.marketplaceAddress,
    amount: price,
    withPermit: (deadline, v, r, s) =>
      writeContract(config, {
        ...base,
        functionName: "purchaseWithPermit",
        args: [quote.itemId, price, quote.purchaseRef, deadline, v, r, s],
      }),
    withAllowance: () =>
      writeContract(config, { ...base, functionName: "purchase", args: [quote.itemId, price, quote.purchaseRef] }),
  });
}

export interface BountyFunding {
  bountyId: Hex;
  rewardUsdc: number;
  maxContributors: number;
  depositUsdc: string;
  marketplaceAddress: Address;
  usdcAddress: Address;
}

/** Escrow a data request's full budget (rewards + protocol fee) in the marketplace. */
export function fundBounty(config: Config, account: Address, f: BountyFunding): Promise<Hex> {
  const deposit = BigInt(f.depositUsdc);
  const reward = BigInt(f.rewardUsdc);
  const maxFills = f.maxContributors;
  const base = { account, address: f.marketplaceAddress, abi: kyralMarketplaceAbi } as const;
  return pay(config, account, {
    token: f.usdcAddress,
    spender: f.marketplaceAddress,
    amount: deposit,
    withPermit: (deadline, v, r, s) =>
      writeContract(config, {
        ...base,
        functionName: "createBountyWithPermit",
        args: [f.bountyId, reward, maxFills, deposit, deadline, v, r, s],
      }),
    withAllowance: () =>
      writeContract(config, { ...base, functionName: "createBounty", args: [f.bountyId, reward, maxFills] }),
  });
}

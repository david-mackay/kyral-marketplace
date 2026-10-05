"use client";

import { useState } from "react";
import { useAppKitAccount } from "@reown/appkit/react";
import { useConfig } from "wagmi";
import { getChainId, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import type { Address } from "viem";

import { testUsdcAbi } from "@/lib/abi/test-usdc";
import { monadChain, USDC_ADDRESS } from "@/lib/chain";

/** Mints 1,000 TestUSDC to the connected wallet. Testnet demo only. */
export function UsdcFaucetButton() {
  const { address } = useAppKitAccount();
  const config = useConfig();
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function mint() {
    if (!address) return;
    setStatus("pending");
    setMessage(null);
    try {
      if (getChainId(config) !== monadChain.id) {
        await switchChain(config, { chainId: monadChain.id });
      }
      const hash = await writeContract(config, {
        account: address as Address,
        address: USDC_ADDRESS,
        abi: testUsdcAbi,
        functionName: "faucet",
      });
      await waitForTransactionReceipt(config, { hash });
      setStatus("done");
      setMessage("$1,000 in test funds added.");
    } catch (error) {
      setStatus("error");
      setMessage(
        (error as { shortMessage?: string }).shortMessage ??
          (error instanceof Error ? error.message : "Faucet failed")
      );
    }
  }

  return (
    <div className="text-center text-xs text-zinc-500 space-y-1">
      <button
        onClick={() => void mint()}
        disabled={!address || status === "pending"}
        className="text-emerald-400 hover:text-emerald-300 underline disabled:opacity-50"
      >
        {status === "pending" ? "Adding test funds…" : "Add $1,000 test funds"}
      </button>
      {message && (
        <div className={status === "error" ? "text-red-400" : "text-zinc-400"}>
          {message}
        </div>
      )}
      <div>
        Network fees need a little testnet MON from the{" "}
        <a
          href="https://faucet.monad.xyz"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-zinc-300"
        >
          Monad faucet
        </a>
        .
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import { LoadingDots } from "@/components/LoadingDots";

export default function AuthPage() {
  const router = useRouter();
  const { status, isAuthenticated, error, authenticate } = useWalletAuth();

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, router]);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center mb-6">
            <span className="text-white font-bold text-2xl">K</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">
            Connect to Kyral
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Connect your Solana wallet to access the health data marketplace.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-6">
          {status === "checking" && (
            <div className="text-center py-8">
              <div className="text-zinc-400 text-sm">
                Checking session <LoadingDots />
              </div>
            </div>
          )}

          {status === "authenticating" && (
            <div className="text-center py-8 space-y-3">
              <div className="text-zinc-300 text-sm font-medium">
                Signing in...
              </div>
              <div className="text-zinc-500 text-xs">
                Please approve the signature request in your wallet.
              </div>
            </div>
          )}

          {(status === "unauthenticated" || status === "error") && (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {error}
                  <button
                    onClick={() => void authenticate()}
                    className="ml-2 underline hover:text-red-300"
                  >
                    Try again
                  </button>
                </div>
              )}

              <div className="text-center py-4">
                <p className="text-sm text-zinc-400 mb-6">
                  Click the button below to connect your wallet. We support
                  Phantom, Solflare, and other Solana wallets.
                </p>

                {/* Reown AppKit connect button */}
                <div className="flex justify-center">
                  <appkit-button />
                </div>
              </div>
            </div>
          )}

          {status === "authenticated" && (
            <div className="text-center py-8">
              <div className="text-emerald-400 text-sm font-medium">
                Connected! Redirecting...
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-zinc-600">
          By connecting, you agree to the Kyral Marketplace Terms of Service.
        </p>
      </div>
    </div>
  );
}

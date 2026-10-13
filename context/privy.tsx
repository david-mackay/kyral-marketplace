"use client";

import { type ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "wagmi";

import { monadChain } from "@/lib/chain";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
if (!appId) console.warn("NEXT_PUBLIC_PRIVY_APP_ID is not set. Sign-in won't work.");

export const wagmiConfig = createConfig({
  chains: [monadChain],
  transports: { [monadChain.id]: http() },
  ssr: true,
});

const queryClient = new QueryClient();

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={appId ?? ""}
      config={{
        loginMethods: ["email", "google", "apple", "wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#34d399",
          landingHeader: "Sign in to Kyral",
          loginMessage: "Get paid when research uses your health data.",
          walletChainType: "ethereum-only",
        },
        // Patients who sign in with email or Google get a self-custodial wallet
        // they never have to see; payouts land there.
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: true },
        defaultChain: monadChain,
        supportedChains: [monadChain],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

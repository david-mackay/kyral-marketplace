"use client";

import { type ReactNode } from "react";
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain } from "@reown/appkit/networks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";

import { monadChain } from "@/lib/chain";

interface AppKitProviderProps {
  children: ReactNode;
}

const projectId =
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ??
  process.env.NEXT_PUBLIC_PROJECT_ID;

if (!projectId) {
  console.warn(
    "NEXT_PUBLIC_REOWN_PROJECT_ID is not set. Reown auth may not work."
  );
}

const getBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3000";
};

const createMetadata = () => {
  const baseUrl = getBaseUrl();
  return {
    name: "Kyral Marketplace",
    description: "Own, sell, and pool your health data on Monad",
    url: baseUrl,
    icons: [`${baseUrl}/favicon.ico`],
  };
};

const metadata = createMetadata();

const monad = defineChain({
  ...monadChain,
  chainNamespace: "eip155",
  caipNetworkId: `eip155:${monadChain.id}`,
});

export const wagmiAdapter = new WagmiAdapter({
  projectId: projectId ?? "",
  networks: [monad],
  ssr: true,
});

export const reownAppKit = createAppKit({
  adapters: [wagmiAdapter],
  projectId: projectId ?? "",
  networks: [monad],
  defaultNetwork: monad,
  metadata,
  features: {
    email: true,
    socials: ["google", "apple"],
    analytics: false,
  },
  enableCoinbase: false,
});

const queryClient = new QueryClient();

export function AppKitProvider({ children }: AppKitProviderProps) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

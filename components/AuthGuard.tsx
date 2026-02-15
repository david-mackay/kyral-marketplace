"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import { LoadingDots } from "@/components/LoadingDots";

export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, isAuthenticated } = useWalletAuth();

  useEffect(() => {
    if (status === "unauthenticated" || status === "error") {
      router.push("/auth");
    }
  }, [status, router]);

  if (status === "checking" || status === "authenticating") {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-zinc-400 text-sm flex items-center gap-2">
          Loading <LoadingDots />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

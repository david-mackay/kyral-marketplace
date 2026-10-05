"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppKit } from "@reown/appkit/react";

import { useWalletAuth } from "@/hooks/useWalletAuth";

function nextPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/earn";
}

export default function AuthPage() {
  const router = useRouter();
  const { open } = useAppKit();
  const { status, isAuthenticated, error, authenticate } = useWalletAuth();

  useEffect(() => {
    if (isAuthenticated) router.replace(nextPath());
  }, [isAuthenticated, router]);

  const busy = status === "checking" || status === "authenticating" || status === "authenticated";

  return (
    <div className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-4">
      <div className="glass-strong w-full max-w-md p-8 sm:p-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Welcome to Kyral</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Get paid when research uses your health data, or find the data your study needs.
        </p>

        <div className="mt-8 space-y-3">
          {busy ? (
            <div className="py-3 text-sm text-zinc-300">
              {status === "checking" && "Checking your session…"}
              {status === "authenticating" && "Approve the sign-in request to continue."}
              {status === "authenticated" && "Signed in. One moment…"}
            </div>
          ) : (
            <>
              <button onClick={() => void open()} className="btn-liquid w-full">Continue with email or Google</button>
              <button onClick={() => void open({ view: "Connect" })} className="btn-ghost w-full">I have a crypto wallet</button>
            </>
          )}
          {error && (
            <div className="text-sm text-red-300">
              {error}{" "}
              <button onClick={() => void authenticate()} className="underline">Try again</button>
            </div>
          )}
        </div>

        <p className="mt-8 text-[11px] text-zinc-500">No crypto knowledge needed. We create a secure account for you.</p>
      </div>
    </div>
  );
}

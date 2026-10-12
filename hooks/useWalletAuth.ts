"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppKitAccount, useDisconnect } from "@reown/appkit/react";
import { useSignMessage } from "wagmi";
import type { Address } from "viem";

type AuthStatus =
  | "checking"
  | "unauthenticated"
  | "authenticating"
  | "authenticated"
  | "error";

interface AuthUser {
  id: string;
  walletAddress: string;
}

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  error?: string | null;
}

const initialState: AuthState = {
  status: "checking",
  user: null,
  error: null,
};

// Several components mount this hook at once; they must share one signature
// prompt, or the wallet receives concurrent personal_sign requests.
let pendingSignIn: { wallet: string; promise: Promise<AuthUser> } | null = null;

export function useWalletAuth() {
  const { address, isConnected } = useAppKitAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect: disconnectWallet } = useDisconnect();
  const [state, setState] = useState<AuthState>(initialState);

  // Refs to prevent concurrent/duplicate authenticate calls
  const isAuthenticatingRef = useRef(false);
  const hasAttemptedForAddressRef = useRef<string | null>(null);
  const sessionCheckedRef = useRef(false);

  // ── Check existing session on mount ──────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const res = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "same-origin",
        });

        if (cancelled) return;

        if (!res.ok) {
          setState({ status: "unauthenticated", user: null });
          sessionCheckedRef.current = true;
          return;
        }

        const data = (await res.json()) as {
          authenticated: boolean;
          user?: AuthUser;
        };

        if (cancelled) return;

        if (data.authenticated && data.user) {
          setState({ status: "authenticated", user: data.user });
        } else {
          setState({ status: "unauthenticated", user: null });
        }
      } catch {
        if (!cancelled) {
          setState({
            status: "error",
            user: null,
            error: "Failed to load session",
          });
        }
      } finally {
        sessionCheckedRef.current = true;
      }
    }

    void checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Core authenticate function (called at most once per address) ─
  const authenticate = useCallback(
    async (wallet: string) => {
      // Concurrency lock
      if (isAuthenticatingRef.current) return;
      isAuthenticatingRef.current = true;

      setState((prev) => ({ ...prev, status: "authenticating", error: null }));

      try {
        if (pendingSignIn?.wallet.toLowerCase() !== wallet.toLowerCase()) {
          const promise = (async () => {
            const nonceRes = await fetch(`/api/auth/nonce?address=${wallet}`, { cache: "no-store" });
            if (!nonceRes.ok) throw new Error("Failed to get auth challenge");
            const { message } = (await nonceRes.json()) as { message: string };

            const signature = await signMessageAsync({ account: wallet as Address, message });

            const res = await fetch("/api/auth/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify({ walletAddress: wallet, message, signature }),
            });
            if (!res.ok) {
              const errorBody = await res.json().catch(() => ({}));
              throw new Error((errorBody as { error?: string }).error || "Failed to create session");
            }
            const data = (await res.json()) as { ok: boolean; user: AuthUser };
            if (!data.ok || !data.user) throw new Error("Failed to create session");
            return data.user;
          })();
          pendingSignIn = { wallet, promise };
          void promise.finally(() => {
            if (pendingSignIn?.promise === promise) pendingSignIn = null;
          }).catch(() => {});
        }
        const user = await pendingSignIn!.promise;

        hasAttemptedForAddressRef.current = wallet;
        setState({ status: "authenticated", user });
      } catch (error) {
        console.error("Authentication failed", error);
        setState({
          status: "error",
          user: null,
          error:
            error instanceof Error ? error.message : "Authentication failed",
        });
      } finally {
        isAuthenticatingRef.current = false;
      }
    },
    [signMessageAsync]
  );

  // ── React to wallet connection changes ───────────────────────────
  // Intentionally uses minimal deps — reads latest values from refs
  // and parameters to avoid re-trigger loops.
  useEffect(() => {
    // Wallet disconnected
    if (!isConnected || !address) {
      // Only clear server session once per disconnect cycle
      if (hasAttemptedForAddressRef.current !== null) {
        hasAttemptedForAddressRef.current = null;
        void fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
        }).catch(() => {});
      }
      setState({ status: "unauthenticated", user: null, error: null });
      return;
    }

    // Still checking existing session — wait for that to finish first
    if (!sessionCheckedRef.current) return;

    // Already authenticated for this address
    if (
      state.status === "authenticated" &&
      state.user?.walletAddress.toLowerCase() === address.toLowerCase()
    ) {
      hasAttemptedForAddressRef.current = address;
      return;
    }

    // Already attempted for this address (prevents retry loops on error)
    if (hasAttemptedForAddressRef.current === address) return;

    // Already in progress
    if (isAuthenticatingRef.current) return;

    // All conditions met: trigger a single authenticate
    hasAttemptedForAddressRef.current = address;
    void authenticate(address);
  }, [isConnected, address, state.status, state.user, authenticate]);

  const logout = useCallback(async () => {
    hasAttemptedForAddressRef.current = null;
    setState({ status: "unauthenticated", user: null });

    try {
      // Clear server session
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch (error) {
      console.error("Failed to clear server session", error);
    }

    try {
      // Disconnect the Reown wallet so isConnected becomes false
      // and the connection effect doesn't re-trigger auth
      await disconnectWallet();
    } catch (error) {
      console.error("Failed to disconnect wallet", error);
    }

    // Redirect to home
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  }, [disconnectWallet]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!res.ok) {
        setState({ status: "unauthenticated", user: null });
        return;
      }
      const data = (await res.json()) as {
        authenticated: boolean;
        user?: AuthUser;
      };
      if (data.authenticated && data.user) {
        setState({ status: "authenticated", user: data.user });
      } else {
        setState({ status: "unauthenticated", user: null });
      }
    } catch {
      setState({ status: "unauthenticated", user: null });
    }
  }, []);

  // Allow manual retry after error
  const retryAuth = useCallback(() => {
    if (!isConnected || !address) return;
    hasAttemptedForAddressRef.current = null;
    void authenticate(address);
  }, [isConnected, address, authenticate]);

  return useMemo(
    () => ({
      status: state.status,
      user: state.user,
      error: state.error,
      isAuthenticated: state.status === "authenticated",
      authenticate: retryAuth,
      logout,
      refresh,
    }),
    [state, retryAuth, logout, refresh]
  );
}

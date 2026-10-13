"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

type AuthStatus = "checking" | "unauthenticated" | "authenticating" | "authenticated" | "error";

interface AuthUser {
  id: string;
  walletAddress: string;
}

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  error?: string | null;
}

// Several components mount this hook at once; they must share one session
// exchange instead of each posting the Privy token.
let pendingExchange: { wallet: string; promise: Promise<AuthUser> } | null = null;

async function fetchSession(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) return null;
  const data = (await res.json()) as { authenticated: boolean; user?: AuthUser };
  return data.authenticated && data.user ? data.user : null;
}

function exchangeSession(wallet: string, getAccessToken: () => Promise<string | null>): Promise<AuthUser> {
  if (pendingExchange?.wallet.toLowerCase() === wallet.toLowerCase()) return pendingExchange.promise;
  const promise = (async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error("Your sign-in expired. Please sign in again.");
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ accessToken, walletAddress: wallet }),
    });
    const body = (await res.json().catch(() => ({}))) as { user?: AuthUser; error?: string };
    if (!res.ok || !body.user) throw new Error(body.error ?? "Couldn't sign you in");
    return body.user;
  })();
  pendingExchange = { wallet, promise };
  void promise
    .finally(() => {
      if (pendingExchange?.promise === promise) pendingExchange = null;
    })
    .catch(() => {});
  return promise;
}

/**
 * Privy handles sign-in (email, Google, Apple, or an external wallet) and
 * gives every user a wallet. We exchange the Privy access token for our own
 * session bound to the active wallet, which is where payouts go.
 */
export function useWalletAuth() {
  const { ready, authenticated, user: privyUser, getAccessToken, login, logout: privyLogout } = usePrivy();
  const { address } = useAccount();
  const [state, setState] = useState<AuthState>({ status: "checking", user: null, error: null });
  const sessionChecked = useRef(false);
  const attemptedFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSession()
      .then((user) => {
        if (!cancelled) setState(user ? { status: "authenticated", user } : { status: "unauthenticated", user: null });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "unauthenticated", user: null });
      })
      .finally(() => {
        sessionChecked.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const exchange = useCallback(
    (wallet: string) =>
      exchangeSession(wallet, getAccessToken).then(
        (user) => setState({ status: "authenticated", user }),
        (error) =>
          setState({ status: "error", user: null, error: error instanceof Error ? error.message : "Couldn't sign you in" })
      ),
    [getAccessToken]
  );

  useEffect(() => {
    if (!ready || !sessionChecked.current) return;

    if (!authenticated) {
      // Signed out of Privy: our session must not outlive it.
      if (state.status === "authenticated") {
        void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
          .catch(() => {})
          .then(() => setState({ status: "unauthenticated", user: null }));
      }
      attemptedFor.current = null;
      return;
    }

    if (!address) return; // Privy is still creating or connecting the wallet.
    if (state.status === "authenticated" && state.user?.walletAddress.toLowerCase() === address.toLowerCase()) {
      attemptedFor.current = address;
      return;
    }
    if (attemptedFor.current === address) return;
    attemptedFor.current = address;
    void exchange(address);
  }, [ready, authenticated, address, state.status, state.user, exchange]);

  const logout = useCallback(async () => {
    setState({ status: "unauthenticated", user: null });
    attemptedFor.current = null;
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
    await privyLogout().catch(() => {});
    window.location.href = "/";
  }, [privyLogout]);

  const refresh = useCallback(async () => {
    const user = await fetchSession().catch(() => null);
    setState(user ? { status: "authenticated", user } : { status: "unauthenticated", user: null });
  }, []);

  const retry = useCallback(() => {
    if (!address) return login();
    attemptedFor.current = address;
    setState({ status: "authenticating", user: null, error: null });
    void exchange(address);
  }, [address, exchange, login]);

  const signingIn = ready && authenticated && state.status !== "authenticated" && state.status !== "error";
  const email = privyUser?.email?.address ?? privyUser?.google?.email ?? privyUser?.apple?.email ?? null;

  return useMemo(
    () => ({
      status: signingIn ? ("authenticating" as const) : state.status,
      user: state.user,
      error: state.error,
      email,
      isAuthenticated: state.status === "authenticated",
      login,
      authenticate: retry,
      logout,
      refresh,
    }),
    [state, signingIn, email, login, retry, logout, refresh]
  );
}

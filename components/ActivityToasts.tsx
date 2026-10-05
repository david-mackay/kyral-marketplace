"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useWalletAuth } from "@/hooks/useWalletAuth";
import { Money } from "@/components/ui";

interface ActivityEvent {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  amountUsdc: number | null;
  href: string | null;
}

const POLL_MS = 12_000;
const VISIBLE_MS = 7_000;

/** Small glass notifications whenever your data participates somewhere. */
export function ActivityToasts() {
  const { isAuthenticated } = useWalletAuth();
  const [toasts, setToasts] = useState<ActivityEvent[]>([]);
  const seen = useRef(new Set<string>());

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/activity?unread=true", { cache: "no-store" });
      if (!res.ok) return;
      const { events } = (await res.json()) as { events: ActivityEvent[] };
      const fresh = events.filter((e) => !seen.current.has(e.id)).slice(0, 3);
      if (fresh.length === 0) return;
      fresh.forEach((e) => seen.current.add(e.id));
      setToasts((t) => [...fresh, ...t].slice(0, 3));
      void fetch("/api/activity", { method: "POST" });
      for (const e of fresh) {
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== e.id)), VISIBLE_MS);
      }
    } catch {
      // Notifications are best-effort.
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    const first = setTimeout(() => void poll(), 1_500);
    const interval = setInterval(() => void poll(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [isAuthenticated, poll]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]">
      {toasts.map((t) => {
        const body = (
          <div className="glass-strong toast-in flex items-start gap-3 px-4 py-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-zinc-100 leading-snug">{t.title}</div>
              {t.detail && <div className="text-[11px] text-zinc-500 truncate mt-0.5">{t.detail}</div>}
            </div>
            {t.amountUsdc ? (
              <Money usdc={t.amountUsdc} className="text-[13px] font-medium text-emerald-300 shrink-0" />
            ) : null}
          </div>
        );
        return t.href ? (
          <Link key={t.id} href={t.href}>
            {body}
          </Link>
        ) : (
          <div key={t.id}>{body}</div>
        );
      })}
    </div>
  );
}

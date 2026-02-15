"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadingDots } from "@/components/LoadingDots";
import { formatUsdc, formatDate } from "@/lib/format";

type RevenueEvent = {
  id: string;
  purchaseId: string;
  recipientUserId: string;
  amountUsdc: number;
  txSignature: string | null;
  status: string;
  createdAt: string;
};

export default function EarningsPage() {
  const [events, setEvents] = useState<RevenueEvent[]>([]);
  const [totalEarned, setTotalEarned] = useState(0);
  const [totalPending, setTotalPending] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadEarnings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/earnings", { cache: "no-store" });
      const data = await res.json();
      setEvents(data.events ?? []);
      setTotalEarned(data.totalEarned ?? 0);
      setTotalPending(data.totalPending ?? 0);
    } catch (error) {
      console.error("Failed to load earnings", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEarnings();
  }, [loadEarnings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-zinc-400 text-sm flex items-center gap-2">
          Loading <LoadingDots />
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Earnings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Track your revenue from data sales and dataset contributions.
        </p>
      </div>

      {/* Summary */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-transparent p-6">
          <div className="text-xs text-zinc-500 mb-1">Total Earned</div>
          <div className="text-2xl font-bold text-emerald-400">
            {formatUsdc(totalEarned)}
          </div>
          <div className="text-xs text-zinc-600 mt-1">USDC (confirmed)</div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-transparent p-6">
          <div className="text-xs text-zinc-500 mb-1">Pending</div>
          <div className="text-2xl font-bold text-amber-400">
            {formatUsdc(totalPending)}
          </div>
          <div className="text-xs text-zinc-600 mt-1">Awaiting settlement</div>
        </div>
        <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/50 p-6">
          <div className="text-xs text-zinc-500 mb-1">Transactions</div>
          <div className="text-2xl font-bold text-zinc-200">
            {events.length}
          </div>
          <div className="text-xs text-zinc-600 mt-1">Total payouts</div>
        </div>
      </div>

      {/* Transaction History */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">
          Transaction History
        </h2>
        {events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 p-8 text-center">
            <p className="text-sm text-zinc-600">
              No earnings yet. List your data or contribute to datasets to start
              earning.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
            {events.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between px-5 py-4"
              >
                <div>
                  <div className="text-sm text-zinc-200">Revenue payout</div>
                  <div className="text-xs text-zinc-600">
                    {formatDate(e.createdAt)}
                    {e.txSignature && (
                      <a
                        href={`https://solscan.io/tx/${e.txSignature}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-emerald-500/70 hover:text-emerald-400"
                      >
                        tx: {e.txSignature.slice(0, 8)}...
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={[
                      "text-xs px-2 py-0.5 rounded-md",
                      e.status === "confirmed"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : e.status === "failed"
                        ? "bg-red-500/10 text-red-400"
                        : "bg-amber-500/10 text-amber-400",
                    ].join(" ")}
                  >
                    {e.status}
                  </span>
                  <span className="text-sm font-medium text-emerald-400">
                    +{formatUsdc(e.amountUsdc)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

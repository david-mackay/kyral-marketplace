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
  const [availableBalance, setAvailableBalance] = useState(0);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);
  const [withdrawalPending, setWithdrawalPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawResult, setWithdrawResult] = useState<{
    ok: boolean;
    message: string;
    txSignature?: string;
  } | null>(null);

  const loadEarnings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/earnings", { cache: "no-store" });
      const data = await res.json();
      setEvents(data.events ?? []);
      setAvailableBalance(data.availableBalance ?? 0);
      setTotalWithdrawn(data.totalWithdrawn ?? 0);
      setWithdrawalPending(data.withdrawalPending ?? 0);
    } catch (error) {
      console.error("Failed to load earnings", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEarnings();
  }, [loadEarnings]);

  const handleWithdraw = useCallback(async () => {
    if (availableBalance <= 0) return;
    setWithdrawing(true);
    setWithdrawResult(null);
    try {
      const res = await fetch("/api/withdrawals", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setWithdrawResult({ ok: false, message: data.error ?? "Withdrawal failed" });
        return;
      }
      setWithdrawResult({
        ok: true,
        message: `Withdrew ${formatUsdc(data.amountUsdc)} USDC`,
        txSignature: data.txSignature,
      });
      // Refresh data
      await loadEarnings();
    } catch (error) {
      setWithdrawResult({
        ok: false,
        message: error instanceof Error ? error.message : "Withdrawal failed",
      });
    } finally {
      setWithdrawing(false);
    }
  }, [availableBalance, loadEarnings]);

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

      {/* Summary Cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-transparent p-6">
          <div className="text-xs text-zinc-500 mb-1">Available to Withdraw</div>
          <div className="text-2xl font-bold text-emerald-400">
            {formatUsdc(availableBalance)}
          </div>
          <div className="text-xs text-zinc-600 mt-1">USDC</div>
        </div>
        <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/50 p-6">
          <div className="text-xs text-zinc-500 mb-1">Total Withdrawn</div>
          <div className="text-2xl font-bold text-zinc-200">
            {formatUsdc(totalWithdrawn)}
          </div>
          <div className="text-xs text-zinc-600 mt-1">USDC (confirmed)</div>
        </div>
        <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/50 p-6">
          <div className="text-xs text-zinc-500 mb-1">Transactions</div>
          <div className="text-2xl font-bold text-zinc-200">
            {events.length}
          </div>
          <div className="text-xs text-zinc-600 mt-1">Total revenue events</div>
        </div>
      </div>

      {/* Withdraw Button */}
      {availableBalance > 0 && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-zinc-200">
                Withdraw your earnings
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {formatUsdc(availableBalance)} USDC will be sent to your connected wallet
              </div>
            </div>
            <button
              onClick={() => void handleWithdraw()}
              disabled={withdrawing}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors disabled:opacity-50"
            >
              {withdrawing ? (
                <span className="inline-flex items-center gap-2">
                  Withdrawing <LoadingDots />
                </span>
              ) : (
                `Withdraw ${formatUsdc(availableBalance)} USDC`
              )}
            </button>
          </div>
        </div>
      )}

      {/* Withdrawal in progress notice */}
      {withdrawalPending > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
          Withdrawal of {formatUsdc(withdrawalPending)} USDC is being processed...
        </div>
      )}

      {/* Withdraw result */}
      {withdrawResult && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            withdrawResult.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {withdrawResult.message}
          {withdrawResult.txSignature && (
            <a
              href={`https://solscan.io/tx/${withdrawResult.txSignature}`}
              target="_blank"
              rel="noreferrer"
              className="ml-2 underline hover:text-emerald-300"
            >
              View on Solscan
            </a>
          )}
        </div>
      )}

      {/* Transaction History */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">
          Revenue History
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
                  <div className="text-sm text-zinc-200">
                    {e.status === "pending"
                      ? "Earned (available)"
                      : e.status === "sent"
                      ? "Withdrawal processing"
                      : e.status === "confirmed"
                      ? "Withdrawn"
                      : "Failed"}
                  </div>
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
                        : e.status === "pending"
                        ? "bg-blue-500/10 text-blue-400"
                        : "bg-amber-500/10 text-amber-400",
                    ].join(" ")}
                  >
                    {e.status === "pending" ? "claimable" : e.status}
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

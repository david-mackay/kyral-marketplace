"use client";

import Link from "next/link";
import { GlobalPopulationCounter } from "@/components/GlobalPopulationCounter";

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* ── 1. HERO ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/20 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-28 sm:py-36">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-medium mb-8">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Built on Solana
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-zinc-50 leading-[1.1]">
              Corporations are earning over{" "}
              <span className="bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">
                $100,000
              </span>{" "}
              from your health data.
              <br className="hidden sm:block" />
              <span className="text-zinc-400"> You get nothing.</span>
            </h1>
            <p className="mt-6 text-lg text-zinc-400 max-w-2xl leading-relaxed">
              Kyral lets you own your health data and get paid when researchers
              use it.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link
                href="/auth"
                className="inline-flex items-center justify-center px-8 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
              >
                Claim your data
              </Link>
              <Link
                href="/marketplace"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl border border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-zinc-100 font-medium text-sm transition-colors"
              >
                Explore Marketplace
              </Link>
            </div>
            <p className="mt-6 text-xs text-zinc-600">Built on Solana</p>
          </div>
        </div>
      </section>

      {/* ── 2. THE SCALE (COUNTER) ───────────────────────────────── */}
      <section className="py-24 sm:py-32 text-center">
        <GlobalPopulationCounter />
        <p className="mt-5 text-xs font-semibold text-zinc-600 uppercase tracking-[0.2em]">
          People whose health data is being extracted right now
        </p>
        <p className="mt-8 text-base sm:text-lg text-zinc-500 max-w-lg mx-auto leading-relaxed">
          Every one of them generates data worth tens of thousands of dollars
          over their lifetime.{" "}
          <span className="text-zinc-200 font-medium">
            Not one of them owns it.
          </span>
        </p>
      </section>

      {/* ── 4. VISION BRIDGE ─────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 pb-20">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-zinc-50">
            AI is flooding the world with synthetic identities. Real human
            health data has never been worth more.
          </h2>
          <p className="mt-5 text-lg text-zinc-400 leading-relaxed">
            Kyral is built so that value flows to the people who create it. Your
            data. Your earnings. Your family's inheritance.
          </p>
        </div>
      </section>

      {/* ── 5. HOW IT WORKS (3 key pillars) ─────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-24">
        <p className="text-center text-xs font-semibold text-zinc-600 uppercase tracking-[0.2em] mb-10">
          How it works
        </p>
        <div className="grid sm:grid-cols-3 gap-6">
          <PillarCard
            step="01"
            title="Upload & Own"
            description="Upload your health records. Labs, vitals, wearable data. List them on the marketplace at your price. You set the terms."
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            }
          />
          <PillarCard
            step="02"
            title="Earn USDC"
            description="When researchers purchase your data, you earn automatically. Revenue settles on-chain in USDC with full transparency."
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            }
          />
          <PillarCard
            step="03"
            title="Build a Legacy"
            description="Your health NFTs and earned tokens can be passed to your family. Your data keeps generating value after you're gone."
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z"
              />
            }
          />
        </div>
      </section>

      {/* ── 6. CTA ───────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-32">
        <div className="rounded-2xl border border-emerald-900/40 bg-gradient-to-br from-emerald-950/60 to-zinc-950 p-10 sm:p-16 text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-zinc-50">
            Stop participating. Start earning.
          </h2>
          <p className="mt-4 text-zinc-400 max-w-lg mx-auto leading-relaxed">
            Connect your Solana wallet, upload your records, and get paid when
            researchers use your data. Takes under a minute.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth"
              className="inline-flex items-center justify-center px-10 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
            >
              Get Started
            </Link>
            <Link
              href="/marketplace"
              className="inline-flex items-center justify-center px-8 py-3.5 rounded-xl border border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-zinc-100 font-medium text-sm transition-colors"
            >
              Browse the Marketplace
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function PillarCard({
  step,
  title,
  description,
  icon,
}: {
  step: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card-glow rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 space-y-4 flex flex-col">
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-emerald-500 tracking-widest">
          {step}
        </span>
        <div className="h-px flex-1 bg-zinc-800" />
        <div className="h-9 w-9 rounded-lg bg-zinc-800 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 text-emerald-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            {icon}
          </svg>
        </div>
      </div>
      <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
      <p className="text-sm text-zinc-500 leading-relaxed">{description}</p>
    </div>
  );
}

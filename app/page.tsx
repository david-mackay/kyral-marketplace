"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { GlobalPopulationCounter } from "@/components/GlobalPopulationCounter";
import { Money, PurposeChip } from "@/components/ui";
import type { BountyRow } from "@/lib/bounties";

const STEPS = [
  {
    title: "Upload once",
    body: "Drop in lab PDFs, wearable exports, or spreadsheets. We read them and tell you exactly what's inside.",
  },
  {
    title: "We strip what identifies you",
    body: "Names, addresses, record numbers, and exact dates are removed or shifted before anyone sees a row.",
  },
  {
    title: "We price it and find buyers",
    body: "Your data is matched to studies you've agreed to support and sold at the best price we can find.",
  },
  {
    title: "You get paid, every time",
    body: "Earnings land in your account the moment a study uses your data. Withdraw whenever you want.",
  },
];

export default function HomePage() {
  const [requests, setRequests] = useState<BountyRow[]>([]);

  useEffect(() => {
    void fetch("/api/bounties")
      .then((r) => r.json())
      .then((d) => setRequests((d.bounties ?? []).filter((b: BountyRow) => b.status === "open").slice(0, 3)))
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="pt-24 sm:pt-32 pb-20 max-w-3xl">
        <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-zinc-50 leading-[1.05]">
          Companies make billions from health data.
          <span className="text-zinc-500"> Now you get paid for yours.</span>
        </h1>
        <p className="mt-6 text-lg text-zinc-400 max-w-xl leading-relaxed">
          Upload your records once. Kyral de-identifies them, prices them, and sells them to research you approve.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <Link href="/upload" className="btn-liquid btn-lg">Start earning</Link>
          <Link href="/requests" className="btn-ghost btn-lg">I&apos;m a researcher</Link>
        </div>
      </section>

      <section className="glass divide-hairline px-6 sm:px-10">
        {STEPS.map((s, i) => (
          <div key={s.title} className="grid sm:grid-cols-[3rem_14rem_1fr] gap-2 sm:gap-6 py-6 items-baseline">
            <span className="text-xs text-zinc-500 tabular-nums">0{i + 1}</span>
            <span className="text-zinc-100">{s.title}</span>
            <span className="text-sm text-zinc-400 leading-relaxed">{s.body}</span>
          </div>
        ))}
      </section>

      {requests.length > 0 && (
        <section className="py-20">
          <div className="flex items-end justify-between mb-5 px-1">
            <div>
              <div className="eyebrow mb-1">Open right now</div>
              <h2 className="text-2xl font-semibold text-zinc-50">Studies paying for data</h2>
            </div>
            <Link href="/requests" className="text-sm text-zinc-400 hover:text-zinc-200">All requests →</Link>
          </div>
          <ul className="glass divide-hairline px-6 sm:px-8">
            {requests.map((b) => (
              <li key={b.id}>
                <Link href={`/requests/${b.id}`} className="group flex items-center gap-6 py-5">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-zinc-500">{b.organization ?? "Independent researcher"}</div>
                    <div className="text-zinc-100 group-hover:text-white truncate">{b.title}</div>
                  </div>
                  <PurposeChip purpose={b.purpose} />
                  <div className="text-right">
                    <Money usdc={b.rewardUsdc} className="text-xl font-light text-zinc-50" />
                    <div className="text-[11px] text-zinc-500">per person</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="py-24 text-center">
        <GlobalPopulationCounter />
        <p className="mt-5 eyebrow">People whose health data is sold without them</p>
        <p className="mt-8 text-zinc-400 max-w-lg mx-auto leading-relaxed">
          Real human data has never been worth more.{" "}
          <span className="text-zinc-100">Kyral makes sure the value goes to the people who create it.</span>
        </p>
      </section>

      <section className="glass-strong mb-24 p-10 sm:p-16 text-center">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-50">See what your data is worth.</h2>
        <p className="mt-4 text-zinc-400 max-w-md mx-auto">
          Sign in with email. Upload a file. We&apos;ll show you an estimate in under a minute.
        </p>
        <Link href="/upload" className="btn-liquid btn-lg mt-8">Get started</Link>
        <p className="mt-6 text-[11px] text-zinc-500">Payments and data fingerprints are publicly verifiable on Monad.</p>
      </section>
    </div>
  );
}

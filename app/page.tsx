"use client";

import { FormEvent, useState } from "react";
import { GlobalPopulationCounter } from "@/components/GlobalPopulationCounter";

const personas = [
  "Data owner",
  "Researcher",
  "Investor",
  "Strategic partner",
] as const;

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [persona, setPersona] = useState<(typeof personas)[number]>(
    "Data owner"
  );
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    const response = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, persona }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      setStatus("error");
      setMessage(body.error ?? "Something went wrong. Please try again.");
      return;
    }

    setStatus("success");
    setEmail("");
    setMessage(body.message ?? "You're on the waitlist. We'll be in touch.");
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] overflow-hidden">
      <section className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.20),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.18),transparent_30%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />

        <div className="relative mx-auto grid max-w-7xl gap-14 px-4 py-24 sm:px-6 sm:py-28 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:py-32">
          <div className="flex flex-col justify-center">
            <div className="mb-8 inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 shadow-[0_0_40px_rgba(16,185,129,0.08)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.9)]" />
              Private waitlist now open
            </div>

            <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-zinc-50 sm:text-6xl lg:text-7xl">
              The consent-first market for{" "}
              <span className="bg-gradient-to-r from-emerald-300 via-emerald-400 to-blue-400 bg-clip-text text-transparent">
                human health data.
              </span>
            </h1>

            <p className="mt-7 max-w-2xl text-lg leading-8 text-zinc-400 sm:text-xl">
              Kyral is building the ownership layer for real-world health data
              as AI demand accelerates. Join the private waitlist for early
              access.
            </p>

            <div className="mt-10 grid max-w-2xl grid-cols-3 gap-5 border-y border-zinc-800/80 py-6">
              <Metric label="Market" value="$100K+" />
              <Metric label="Settlement" value="USDC" />
              <Metric label="Network" value="Solana" />
            </div>
          </div>

          <div
            id="waitlist"
            className="card-glow rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-2xl shadow-emerald-950/20 backdrop-blur sm:p-8"
          >
            <div className="mb-8">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
                Early access
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-zinc-50">
                Join the private waitlist
              </h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                We are prioritizing health data owners, clinical researchers,
                and strategic investors who understand the value of verified
                human data.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-zinc-200"
                >
                  Work email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  placeholder="you@company.com"
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                />
              </div>

              <div>
                <label
                  htmlFor="persona"
                  className="text-sm font-medium text-zinc-200"
                >
                  I am a
                </label>
                <select
                  id="persona"
                  name="persona"
                  value={persona}
                  onChange={(event) =>
                    setPersona(event.target.value as (typeof personas)[number])
                  }
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-zinc-100 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                >
                  {personas.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={status === "submitting"}
                className="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:bg-emerald-900 disabled:text-emerald-200"
              >
                {status === "submitting"
                  ? "Joining waitlist..."
                  : "Join the waitlist"}
              </button>

              {message && (
                <p
                  className={[
                    "rounded-xl border px-4 py-3 text-sm",
                    status === "success"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-red-500/30 bg-red-500/10 text-red-300",
                  ].join(" ")}
                >
                  {message}
                </p>
              )}
            </form>

            <p className="mt-5 text-xs leading-5 text-zinc-600">
              No spam. We will only use this to share launch access,
              partnership updates, and investor materials.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">
              Why now
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
              AI made real health data scarce.
            </h2>
            <p className="mt-5 text-lg leading-8 text-zinc-400">
              Synthetic content is everywhere. Verified longitudinal health data
              from real people is becoming the premium input for research,
              model evaluation, and clinical intelligence.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <SignalCard title="Consent" description="People decide what can be shared, with whom, and under what terms." />
            <SignalCard title="Provenance" description="Data provenance matters when clinical AI needs auditable sources." />
            <SignalCard title="Liquidity" description="On-chain settlement makes value transfer transparent from day one." />
          </div>
        </div>
      </section>

      <section className="py-20 text-center">
        <GlobalPopulationCounter />
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">
          People whose health data is being extracted right now
        </p>
        <p className="mx-auto mt-8 max-w-lg text-base leading-relaxed text-zinc-500 sm:text-lg">
          The next data economy should not be built around invisible extraction.
          Kyral is designed so value flows back to the people who create it.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-32 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-emerald-900/40 bg-gradient-to-br from-emerald-950/60 via-zinc-950 to-blue-950/40 p-10 text-center sm:p-16">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-zinc-50">
            Building quietly. Launching with the right network.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-zinc-400">
            We have paused open app access while we shape the first cohort of
            data owners, research buyers, and capital partners.
          </p>
          <a
            href="#waitlist"
            className="mt-8 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-10 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
          >
            Request access
          </a>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xl font-semibold text-zinc-50 sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-zinc-600">
        {label}
      </p>
    </div>
  );
}

function SignalCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
      <div className="mb-6 h-10 w-10 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
        <div className="h-full w-full rounded-xl bg-[radial-gradient(circle_at_35%_35%,rgba(52,211,153,0.8),transparent_45%)]" />
      </div>
      <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-zinc-500">{description}</p>
    </div>
  );
}

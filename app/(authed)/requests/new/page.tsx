"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAppKitAccount } from "@reown/appkit/react";
import type { Address } from "viem";
import { useConfig } from "wagmi";

import { UsdcFaucetButton } from "@/components/UsdcFaucetButton";
import { Sheet } from "@/components/ui";
import { formatRate } from "@/lib/bounties";
import { USDC_HAS_FAUCET } from "@/lib/chain";
import { CONSENT_PURPOSES, PURPOSE_LABELS, type ConsentPurpose } from "@/lib/data-profile";
import { CATEGORY_LABELS, DATA_CATEGORIES, formatUsdc } from "@/lib/format";
import { fundBounty, type BountyFunding } from "@/lib/purchase";
import { SIGNALS, detectSignals, type Signal } from "@/lib/signals";

const SIGNAL_GROUPS = [...SIGNALS.reduce((m, s) => m.set(s.category, [...(m.get(s.category) ?? []), s]), new Map<string, Signal[]>())];

const RENTAL_DURATIONS = [
  { seconds: 3_600, label: "1 hour" },
  { seconds: 6 * 3_600, label: "6 hours" },
  { seconds: 86_400, label: "1 day" },
  { seconds: 3 * 86_400, label: "3 days" },
  { seconds: 7 * 86_400, label: "1 week" },
];

const SPAN_OPTIONS = [
  { days: 0, label: "Any" },
  { days: 30, label: "1 month+" },
  { days: 90, label: "3 months+" },
  { days: 180, label: "6 months+" },
  { days: 365, label: "1 year+" },
];

function friendlyError(error: unknown) {
  const msg = (error as { shortMessage?: string }).shortMessage ?? (error instanceof Error ? error.message : "");
  if (/reject|denied/i.test(msg)) return "You cancelled the payment.";
  if (/Not enough USDC/i.test(msg)) return "Not enough funds in your account to cover the rewards.";
  if (/insufficient funds/i.test(msg)) return "Your account needs a little MON for network fees.";
  return msg || "Something went wrong";
}

export default function NewRequestPage() {
  const router = useRouter();
  const { address } = useAppKitAccount();
  const wagmiConfig = useConfig();

  const [topic, setTopic] = useState("");
  const [planning, setPlanning] = useState(false);

  const [title, setTitle] = useState("");
  const [organization, setOrganization] = useState("");
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState<ConsentPurpose>("academic");
  const [categories, setCategories] = useState<string[]>([]);
  const [signals, setSignals] = useState<string[]>([]);
  const [minRows, setMinRows] = useState(0);
  const [minSpanDays, setMinSpanDays] = useState(0);
  const [reward, setReward] = useState("10");
  const [maxContributors, setMaxContributors] = useState("25");
  const [pricing, setPricing] = useState<"fixed" | "rental">("fixed");
  const [ratePerHour, setRatePerHour] = useState("1");
  const [durationSeconds, setDurationSeconds] = useState(RENTAL_DURATIONS[1]!.seconds);

  const [draft, setDraft] = useState<{ id: string; funding: BountyFunding } | null>(null);
  const [step, setStep] = useState<"idle" | "drafting" | "funding" | "matching">("idle");
  const [error, setError] = useState<string | null>(null);

  const rewardCents = Math.round(Number(reward) * 100);
  const max = Math.max(0, Math.floor(Number(maxContributors)));
  const ratePerSecondUsdc = Math.round((Number(ratePerHour) * 1_000_000) / 3_600);
  const rentals = pricing === "rental";
  const rewardsTotal = rentals ? ratePerSecondUsdc * durationSeconds * max : rewardCents * 10_000 * max;
  const locked = draft !== null;

  const plan = async () => {
    if (topic.trim().length < 5) return;
    setPlanning(true);
    setError(null);
    try {
      const res = await fetch("/api/bios/plan-dataset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Planner unavailable");
      const p = body.plan;
      setTitle(p.title);
      setDescription(`${p.description}\n\n${p.scientificValue}`.trim());
      if (DATA_CATEGORIES.includes(p.category)) setCategories([p.category]);
      const picked = detectSignals(p.suggestedBiomarkers ?? []);
      const implied = detectSignals(p.dataRequirements ?? []).filter((id) => !picked.includes(id));
      setSignals([...picked, ...implied].slice(0, 5));
      if (p.suggestedPriceUsdc) setReward(String(Math.max(1, Math.round(p.suggestedPriceUsdc / 2))));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Planner unavailable");
    } finally {
      setPlanning(false);
    }
  };

  const createDraft = async () => {
    setError(null);
    setStep("drafting");
    try {
      const res = await fetch("/api/bounties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          organization: organization || undefined,
          description: description || undefined,
          purpose,
          criteria: {
            categories,
            requiredSignals: signals,
            minRows,
            minSpanDays,
          },
          ...(rentals
            ? { rental: { ratePerSecondUsdc, durationSeconds } }
            : { rewardUsdc: rewardCents * 10_000 }),
          maxContributors: max,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't create the request");
      setDraft({ id: body.bounty.id, funding: body.funding });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the request");
    } finally {
      setStep("idle");
    }
  };

  const publish = async () => {
    if (!draft || !address) return;
    setError(null);
    setStep("funding");
    try {
      const txHash = await fundBounty(wagmiConfig, address as Address, draft.funding);
      setStep("matching");
      const res = await fetch(`/api/bounties/${draft.id}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't confirm funding");
      router.push(`/requests/${draft.id}`);
    } catch (e) {
      setError(friendlyError(e));
      setStep("idle");
    }
  };

  const toggleCategory = (c: string) =>
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  const toggleSignal = (id: string) =>
    setSignals((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 10 ? [...prev, id] : prev));

  const valid = title.trim().length >= 3 && max >= 1 && (rentals ? ratePerSecondUsdc >= 1 : rewardCents >= 10);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">Post a data request</h1>
        <p className="mt-3 text-zinc-400">
          Describe what you need and set a reward. We match consenting contributors, de-identify their data, and
          deliver it to you. You only pay for matches; the rest is refundable.
        </p>
      </div>

      <Sheet title="Start from your research question">
        <div className="flex gap-2">
          <input
            className="field !rounded-full"
            placeholder="e.g. Sleep and HRV changes after long COVID"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void plan()}
            disabled={locked}
          />
          <button onClick={() => void plan()} disabled={planning || locked || topic.trim().length < 5} className="btn-ghost shrink-0">
            {planning ? "Drafting…" : "Draft it"}
          </button>
        </div>
      </Sheet>

      <Sheet>
        <fieldset disabled={locked} className="space-y-5">
          <Field label="Title">
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Organization (optional)">
              <input className="field" value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Stanford Sleep Lab" />
            </Field>
            <Field label="Use">
              <select className="field" value={purpose} onChange={(e) => setPurpose(e.target.value as ConsentPurpose)}>
                {CONSENT_PURPOSES.map((p) => (
                  <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Description">
            <textarea className="field min-h-28" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          <div className="hairline border-t pt-5">
            <div className="eyebrow mb-3">Matching</div>
            <div className="flex flex-wrap gap-2 mb-5">
              {DATA_CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => toggleCategory(c)}
                  aria-pressed={categories.includes(c)}
                  className="chip-toggle"
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
            <div className="grid sm:grid-cols-3 gap-5">
              <div className="sm:col-span-3">
                <span className="block text-xs text-zinc-400 mb-2">Must include</span>
                <div className="space-y-2.5">
                  {SIGNAL_GROUPS.map(([category, group]) => (
                    <div key={category} className="flex flex-wrap items-center gap-1.5">
                      <span className="w-24 shrink-0 text-[11px] text-zinc-500">{CATEGORY_LABELS[category] ?? "Other"}</span>
                      {group.map((sig) => (
                        <button
                          type="button"
                          key={sig.id}
                          onClick={() => toggleSignal(sig.id)}
                          aria-pressed={signals.includes(sig.id)}
                          className="chip-toggle"
                        >
                          {sig.label}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <Field label="History">
                <select className="field" value={minSpanDays} onChange={(e) => setMinSpanDays(Number(e.target.value))}>
                  {SPAN_OPTIONS.map((o) => (
                    <option key={o.days} value={o.days}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Min. records">
                <input className="field" type="number" min={0} value={minRows} onChange={(e) => setMinRows(Math.max(0, Number(e.target.value)))} />
              </Field>
            </div>
          </div>

          <div className="hairline border-t pt-5 space-y-5">
            <div className="flex gap-2">
              <button type="button" onClick={() => setPricing("fixed")} aria-pressed={!rentals} className="chip-toggle">
                Fixed reward
              </button>
              <button type="button" onClick={() => setPricing("rental")} aria-pressed={rentals} className="chip-toggle">
                Rent by the second
              </button>
            </div>
            {rentals ? (
              <div className="grid sm:grid-cols-3 gap-5">
                <Field label="Rate per person ($ per hour)">
                  <input className="field" type="number" min={0.01} step={0.25} value={ratePerHour} onChange={(e) => setRatePerHour(e.target.value)} />
                  <span className="block text-xs text-zinc-500 mt-1.5">{formatRate(ratePerSecondUsdc)}, paid every second</span>
                </Field>
                <Field label="Access for">
                  <select className="field" value={durationSeconds} onChange={(e) => setDurationSeconds(Number(e.target.value))}>
                    {RENTAL_DURATIONS.map((d) => (
                      <option key={d.seconds} value={d.seconds}>{d.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="People needed">
                  <input className="field" type="number" min={1} value={maxContributors} onChange={(e) => setMaxContributors(e.target.value)} />
                </Field>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-5">
                <Field label="Reward per person ($)">
                  <input className="field" type="number" min={0.1} step={0.5} value={reward} onChange={(e) => setReward(e.target.value)} />
                </Field>
                <Field label="People needed">
                  <input className="field" type="number" min={1} value={maxContributors} onChange={(e) => setMaxContributors(e.target.value)} />
                </Field>
              </div>
            )}
          </div>
        </fieldset>
      </Sheet>

      <div className="glass-strong p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <div className="eyebrow mb-1">{draft ? "Total to fund" : rentals ? "Most this can cost" : "Rewards"}</div>
          <div className="num-display text-4xl">
            {formatUsdc(draft ? Number(draft.funding.depositUsdc) : rewardsTotal)}
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {draft
              ? `Includes a ${formatUsdc(Number(draft.funding.depositUsdc) - rewardsTotal)} platform fee. ${
                  rentals ? "Stop anytime; unused seconds are refunded." : "Unused slots are refunded."
                }`
              : "Plus a small platform fee, shown before you pay."}
          </div>
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-2">
          {!draft ? (
            <button onClick={() => void createDraft()} disabled={!valid || step !== "idle"} className="btn-liquid">
              {step === "drafting" ? "Preparing…" : "Review total"}
            </button>
          ) : (
            <>
              <button onClick={() => void publish()} disabled={step !== "idle" || !address} className="btn-liquid">
                {step === "funding" ? "Confirm in your wallet…" : step === "matching" ? "Finding matches…" : "Fund & publish"}
              </button>
              {step === "idle" && (
                <button
                  onClick={() => {
                    void fetch(`/api/bounties/${draft.id}/close`, { method: "POST" });
                    setDraft(null);
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-300">Edit</button>
              )}
            </>
          )}
        </div>
      </div>

      {error && <div className="text-sm text-red-300 px-1">{error}</div>}
      {USDC_HAS_FAUCET && <UsdcFaucetButton />}
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs text-zinc-400 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

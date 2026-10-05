"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Money, formatSpan } from "@/components/ui";
import type { DataProfile } from "@/lib/data-profile";

const STEPS = ["Reading your file", "Removing anything that identifies you", "Pricing it", "Matching it to studies"];

type Item = {
  key: string;
  file: File;
  state: "queued" | "working" | "done" | "error";
  step: number;
  profile?: DataProfile | null;
  listingPriceUsdc?: number | null;
  requestsFilled?: number;
  shareable?: boolean;
  error?: string;
};

export default function UploadPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const processNext = useCallback(async (queue: Item[]) => {
    if (busy.current) return;
    const next = queue.find((i) => i.state === "queued");
    if (!next) return;
    busy.current = true;
    update(next.key, { state: "working", step: 0 });

    // The server does everything in one request; advance the narration while it works.
    let step = 0;
    const ticker = setInterval(() => {
      step = Math.min(step + 1, STEPS.length - 1);
      update(next.key, { step });
    }, 1_800);

    let patch: Partial<Item>;
    try {
      const form = new FormData();
      form.set("file", next.file);
      const res = await fetch("/api/documents/upload", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      const failed = body.document?.status === "error";
      patch = {
        state: failed ? "error" : "done",
        error: failed ? "We couldn't read this file. It's stored privately." : undefined,
        profile: body.document?.profile ?? null,
        shareable: !!body.document?.deidObjectKey,
        listingPriceUsdc: body.listing?.priceUsdc ?? null,
        requestsFilled: body.requestsFilled ?? 0,
      };
    } catch (e) {
      patch = { state: "error", error: e instanceof Error ? e.message : "Upload failed" };
    }
    clearInterval(ticker);
    busy.current = false;
    // This state change re-runs the effect below, which starts the next file.
    update(next.key, patch);
  }, []);

  useEffect(() => {
    void processNext(items);
  }, [items, processNext]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setItems((xs) => [
      ...xs,
      ...Array.from(files).map((file) => ({ key: `${file.name}-${crypto.randomUUID()}`, file, state: "queued" as const, step: 0 })),
    ]);
  };

  const done = items.filter((i) => i.state === "done");
  const totalValue = done.reduce((s, i) => s + (i.listingPriceUsdc ?? 0), 0);
  const totalStudies = done.reduce((s, i) => s + (i.requestsFilled ?? 0), 0);

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-zinc-50">Add your health data</h1>
        <p className="mt-3 text-zinc-400 max-w-xl">
          Drop in lab results, wearable exports, symptom logs, or medical records. We strip out anything that
          identifies you, price it, and offer it to studies you&apos;ve allowed. You don&apos;t fill in anything.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`glass cursor-pointer px-8 py-16 text-center transition-all ${
          dragging ? "scale-[1.01] border-emerald-300/40" : ""
        }`}
      >
        <div className="mx-auto mb-5 h-14 w-14 rounded-full bg-gradient-to-br from-emerald-300/30 to-sky-400/20 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-emerald-200" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
        </div>
        <div className="text-zinc-100">Drop files here, or click to choose</div>
        <div className="mt-1 text-xs text-zinc-500">CSV, PDF, images and exports from most health apps</div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".csv,.tsv,.pdf,.png,.jpg,.jpeg,.json,.txt,.xml"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="glass divide-hairline px-6 sm:px-8">
          {items.map((item) => (
            <UploadRow key={item.key} item={item} />
          ))}
        </ul>
      )}

      {done.length > 0 && items.every((i) => i.state === "done" || i.state === "error") && (
        <div className="text-center space-y-4 pt-2">
          <div className="text-zinc-400 text-sm">
            {totalValue > 0 && (
              <>
                Listed for a combined <Money usdc={totalValue} className="text-zinc-100" /> per buyer
              </>
            )}
            {totalStudies > 0 && <> · joined {totalStudies} paid {totalStudies === 1 ? "study" : "studies"}</>}
          </div>
          <Link href="/earn" className="btn-liquid">See your earnings</Link>
        </div>
      )}
    </div>
  );
}

function UploadRow({ item }: { item: Item }) {
  const p = item.profile;
  return (
    <li className="py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-zinc-100 truncate">{p?.documentType ?? item.file.name}</div>
          {item.state === "working" && (
            <div className="mt-1 text-xs text-emerald-200/80 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
              {STEPS[item.step]}…
            </div>
          )}
          {item.state === "queued" && <div className="mt-1 text-xs text-zinc-500">Waiting…</div>}
          {item.state === "error" && <div className="mt-1 text-xs text-amber-300">{item.error}</div>}
          {item.state === "done" && p && (
            <>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed max-w-lg">{p.summary}</p>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {p.rowCount > 0 && <span className="chip">{p.rowCount} records</span>}
                {p.spanDays > 0 && <span className="chip">{formatSpan(p.spanDays)}</span>}
                {item.shareable && (
                  <span className="chip text-emerald-200">
                    {p.removedIdentifiers.length ? `Removed ${p.removedIdentifiers.join(", ")}` : "No identifiers found"}
                  </span>
                )}
                {item.shareable && <span className="chip">Dates shifted</span>}
                {!item.shareable && <span className="chip text-amber-200">Kept private</span>}
              </div>
            </>
          )}
        </div>
        {item.state === "done" && (
          <div className="text-right shrink-0">
            {item.listingPriceUsdc ? (
              <>
                <Money usdc={item.listingPriceUsdc} className="text-lg text-zinc-50" />
                <div className="text-[11px] text-zinc-500">per buyer</div>
              </>
            ) : null}
            {item.requestsFilled ? (
              <div className="text-[11px] text-emerald-300 mt-1">Joined {item.requestsFilled} studies</div>
            ) : null}
          </div>
        )}
      </div>
      {item.state === "working" && (
        <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-[width] duration-[1800ms]"
            style={{ width: `${((item.step + 1) / STEPS.length) * 92}%` }}
          />
        </div>
      )}
    </li>
  );
}

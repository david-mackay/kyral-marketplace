"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { PurposeChip, Sheet, SkeletonRows, VerifyLink, timeAgo } from "@/components/ui";

interface FileSummary {
  id: string;
  fileName: string;
  shareable: boolean;
  profile: { documentType: string } | null;
}

interface Table {
  header: string[];
  rows: string[][];
  totalRows: number;
}

interface SharedView {
  id: string;
  originalFileName: string;
  documentType: string | null;
  removedIdentifiers: string[];
  shared: (Partial<Table> & { fileName: string; sha256: string | null; deidentified: boolean }) | null;
  original: Table | null;
  recipients: {
    kind: "study" | "purchase";
    title: string;
    organization: string | null;
    purpose: string | null;
    txHash: string | null;
    createdAt: string;
  }[];
}

export default function MyDataPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={4} />}>
      <MyData />
    </Suspense>
  );
}

function MyData() {
  const router = useRouter();
  const selectedId = useSearchParams().get("file");
  const [files, setFiles] = useState<FileSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/earn", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        setFiles((await res.json()).data);
      })
      .catch(() => setError("We couldn't load your files. Refresh to try again."));
  }, []);

  const activeId = selectedId ?? files?.[0]?.id ?? null;

  return (
    <div className="space-y-8">
      <header className="pt-4">
        <h1 className="text-4xl font-semibold tracking-tight">What researchers see</h1>
        <p className="text-zinc-400 mt-2">
          The exact copy of each file that leaves Kyral, next to your original, and everyone who has received it.
        </p>
      </header>

      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : !files ? (
        <SkeletonRows rows={2} />
      ) : files.length === 0 ? (
        <Sheet>
          <p className="text-sm text-zinc-500">
            No files yet. <Link href="/upload" className="text-emerald-300 hover:underline">Add a file</Link> to see
            what would be shared.
          </p>
        </Sheet>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {files.map((f) => (
              <button
                key={f.id}
                onClick={() => router.replace(`/my-data?file=${f.id}`, { scroll: false })}
                aria-pressed={f.id === activeId}
                className="chip-toggle"
              >
                {f.profile?.documentType ?? f.fileName}
              </button>
            ))}
          </div>
          {activeId && <FileView key={activeId} id={activeId} />}
        </>
      )}
    </div>
  );
}

function FileView({ id }: { id: string }) {
  const [view, setView] = useState<SharedView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    fetch(`/api/documents/${id}/shared`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        setView(await res.json());
      })
      .catch(() => setError("We couldn't load this file. Refresh to try again."));
  }, [id]);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!view) return <SkeletonRows rows={4} />;

  const { shared, original } = view;
  const sharedColumns = new Set(shared?.header ?? []);
  const canCompare = !!original && !!shared?.header;

  return (
    <div className="space-y-6">
      <Sheet
        title={view.documentType ?? view.originalFileName}
        action={
          shared && (
            <a href={`/api/documents/${id}/shared?download=1`} className="btn-ghost btn-sm">
              Download shared copy
            </a>
          )
        }
      >
        {!shared ? (
          <p className="text-sm text-zinc-300">
            This file is never shared. We couldn&apos;t confirm every identifier was removed, so it stays private to you.
          </p>
        ) : (
          <div className="space-y-5">
            {shared.deidentified ? (
              <div className="space-y-2">
                <div className="eyebrow">Removed before sharing</div>
                <div className="flex flex-wrap gap-1.5">
                  {view.removedIdentifiers.length > 0 ? (
                    view.removedIdentifiers.map((r) => (
                      <span key={r} className="chip text-emerald-200">{r}</span>
                    ))
                  ) : (
                    <span className="chip">No identifiers found</span>
                  )}
                  <span className="chip">Dates moved by a private offset</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-amber-200">
                This file was added before automatic de-identification and is shared as you uploaded it.
              </p>
            )}

            {canCompare && (
              <div className="flex gap-2">
                <button onClick={() => setShowOriginal(false)} aria-pressed={!showOriginal} className="chip-toggle">
                  Shared copy
                </button>
                <button onClick={() => setShowOriginal(true)} aria-pressed={showOriginal} className="chip-toggle">
                  Your original
                </button>
              </div>
            )}

            {showOriginal && original ? (
              <>
                <DataTable table={original} isRemoved={(col) => !sharedColumns.has(col)} />
                <p className="text-xs text-zinc-500">Struck-through columns never leave Kyral. Only you can see this view.</p>
              </>
            ) : shared.header && shared.rows && shared.totalRows !== undefined ? (
              <DataTable table={{ header: shared.header, rows: shared.rows, totalRows: shared.totalRows }} />
            ) : (
              <p className="text-sm text-zinc-500">Preview isn&apos;t available for this file type. Download it to see exactly what&apos;s shared.</p>
            )}

            <div className="text-xs text-zinc-500 space-y-1">
              <div>
                Shared as <span className="text-zinc-300">{shared.fileName}</span>
              </div>
              {shared.sha256 && (
                <div className="break-all">
                  Fingerprint <span className="font-mono text-zinc-400">{shared.sha256}</span>. Each study records this
                  fingerprint onchain, so you can check researchers got exactly this file.
                </div>
              )}
            </div>
          </div>
        )}
      </Sheet>

      {shared && (
        <Sheet title="Who has received this file">
          {view.recipients.length === 0 ? (
            <p className="text-sm text-zinc-500">No one yet. It&apos;s shared only when it joins a study or someone buys it.</p>
          ) : (
            <ul className="divide-hairline -my-3">
              {view.recipients.map((r, i) => (
                <li key={i} className="flex items-center gap-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-zinc-100">{r.title}</div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                      {r.organization && <span>{r.organization}</span>}
                      {r.purpose && <PurposeChip purpose={r.purpose} />}
                      <span>{timeAgo(r.createdAt)}</span>
                      <VerifyLink txHash={r.txHash} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      )}
    </div>
  );
}

function DataTable({ table, isRemoved }: { table: Table; isRemoved?: (column: string) => boolean }) {
  const removed = table.header.map((h) => isRemoved?.(h) ?? false);
  return (
    <div className="space-y-2">
      <div className="max-h-[480px] overflow-auto rounded-2xl border border-white/10">
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-zinc-900/95 backdrop-blur">
            <tr>
              {table.header.map((h, c) => (
                <th
                  key={c}
                  className={`px-3 py-2 text-left font-medium whitespace-nowrap ${removed[c] ? "text-red-300/80 line-through" : "text-zinc-300"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {table.rows.map((row, r) => (
              <tr key={r}>
                {table.header.map((_, c) => (
                  <td
                    key={c}
                    className={`px-3 py-1.5 whitespace-nowrap ${removed[c] ? "text-zinc-500 line-through" : "text-zinc-400"}`}
                  >
                    {row[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.totalRows > table.rows.length && (
        <p className="text-xs text-zinc-500">
          Showing the first {table.rows.length} of {table.totalRows} rows.
        </p>
      )}
    </div>
  );
}

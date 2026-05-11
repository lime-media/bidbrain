"use client";

import { useState } from "react";
import Link from "next/link";

interface SyncResults {
  materials?: { added: number; updated: number; deactivated: number };
  vendor_materials?: { added: number; updated: number; deactivated: number };
  price_history?: { added: number; skipped: number };
  dimensions?: { upserted: number };
  categories?: { upserted: number };
}

const SHEET_MAP = [
  { key: "materials", label: "Core_Material_Master", table: "materials" },
  { key: "vendor_materials", label: "Rosseta Stone", table: "vendor_materials" },
  { key: "price_history", label: "Historical Pricing ARCHIVE", table: "price_records" },
  { key: "dimensions", label: "KEY (dimensions)", table: "dimensions" },
  { key: "categories", label: "KEY (categories)", table: "categories" },
];

export default function SyncPage() {
  const [file, setFile] = useState<File | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState<SyncResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    if (!file) return;
    setSyncing(true);
    setError(null);
    setResults(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/sync", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
      <Link href="/" className="text-sm text-[#5a8a15] hover:underline">← Dashboard</Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sync Excel → Supabase</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload the master Excel file to add, update, or deactivate records in all tables.
          Rows removed from Excel will be marked inactive (not deleted).
        </p>
      </div>

      {/* What gets synced */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sheets synced</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Excel sheet</th>
              <th className="px-4 py-2 font-medium">Supabase table</th>
            </tr>
          </thead>
          <tbody>
            {SHEET_MAP.map((s) => (
              <tr key={s.key} className="border-t border-gray-100">
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{s.label}</td>
                <td className="px-4 py-2 text-gray-500">{s.table}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* File picker */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">Excel file (.xlsx)</label>
        <input
          type="file"
          accept=".xlsx,.xls"
          className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#94CE3C]/15 file:text-[#5a8a15] hover:file:bg-[#94CE3C]/25 cursor-pointer"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResults(null);
            setError(null);
          }}
        />
        {file && (
          <p className="text-xs text-gray-400">{file.name} — {(file.size / 1024).toFixed(0)} KB</p>
        )}
      </div>

      <button
        onClick={handleSync}
        disabled={!file || syncing}
        className="rounded-lg bg-[#94CE3C] px-8 py-2.5 text-sm font-semibold text-white hover:bg-[#7fb832] transition-colors disabled:opacity-50"
      >
        {syncing ? "Syncing…" : "Run sync"}
      </button>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {results && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Sync complete</h2>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                  <th className="px-4 py-2.5 font-semibold">Table</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Added</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Updated</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Deactivated / Skipped</th>
                </tr>
              </thead>
              <tbody>
                {SHEET_MAP.map((s) => {
                  const r = results[s.key as keyof SyncResults] as Record<string, number> | undefined;
                  if (!r) return null;
                  return (
                    <tr key={s.key} className="border-t border-gray-100">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{s.table}</td>
                      <td className="px-4 py-2.5 text-right text-green-700">{r.added ?? r.upserted ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right text-blue-700">{r.updated ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right text-gray-500">{r.deactivated ?? r.skipped ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}

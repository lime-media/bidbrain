"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

interface PendingMaterial {
  id: string;
  lime_material_id: string;
  standardized_name: string | null;
  dimension: string | null;
  uom: string | null;
  categories: { code: string } | null;
  suggestions: Array<{ id: string; lime_material_id: string; standardized_name: string; dimension: string | null }>;
  price_records: Array<{ documents: { id: string; source_filename: string; vendor_name_raw: string | null } | null }>;
}

interface PendingVendor {
  id: string;
  name: string;
  documents: Array<{ id: string; source_filename: string }>;
  suggestions: Array<{ id: string; name: string }>;
}

interface OrphanGroup {
  rawId: string;
  recordCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  priceUom: string | null;
  earliest: string | null;
  latest: string | null;
  vendorNames: string[];
  documents: Array<{ id: string; quote_id: string | null; source_filename: string }>;
  quoteIds: string[];
  isLimeIdPattern: boolean;
  suggestions: Array<{ id: string; lime_material_id: string; standardized_name: string; dimension: string | null }>;
}

interface AISuggestion {
  suggestedBaseId: string;
  suggestedName: string;
  suggestedCategory: string;
  suggestedUom: string;
  suggestedDimension: string;
  reasoning: string;
}

interface NewMaterialForm {
  baseId: string;
  name: string;
  category: string;
  uom: string;
  dimension: string;
}

interface DimensionPreview {
  fullMaterialId: string;
  isNew: boolean;
  dimensionId: number;
}

type MatFormState = Record<string, { limeId: string; name: string; dimension: string; uom: string; selectedMergeId: string }>;
type VendorFormState = Record<string, { name: string; selectedMergeId: string }>;

export default function ReviewPage() {
  const [materials, setMaterials] = useState<PendingMaterial[]>([]);
  const [vendors, setVendors] = useState<PendingVendor[]>([]);
  const [orphaned, setOrphaned] = useState<OrphanGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const [matForm, setMatForm] = useState<MatFormState>({});
  const [vendorForm, setVendorForm] = useState<VendorFormState>({});

  // Orphan state
  const [orphanSelection, setOrphanSelection] = useState<Record<string, string>>({});
  const [orphanSearch, setOrphanSearch] = useState<Record<string, string>>({});
  const [orphanResults, setOrphanResults] = useState<Record<string, Array<{ id: string; lime_material_id: string; standardized_name: string; dimension: string | null }>>>({});
  const [orphanSearching, setOrphanSearching] = useState<Record<string, boolean>>({});
  const searchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // AI suggestion state
  const [aiSuggestion, setAiSuggestion] = useState<Record<string, AISuggestion>>({});
  const [aiSuggesting, setAiSuggesting] = useState<Record<string, boolean>>({});
  const [aiError, setAiError] = useState<Record<string, string>>({});
  const [newMatForm, setNewMatForm] = useState<Record<string, NewMaterialForm>>({});
  const [dimPreview, setDimPreview] = useState<Record<string, DimensionPreview>>({});
  const dimTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [saving, setSaving] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/review");
      const data = await res.json();
      const mats: PendingMaterial[] = data.materials ?? [];
      const vends: PendingVendor[] = data.vendors ?? [];
      const orph: OrphanGroup[] = data.orphaned ?? [];

      setMaterials(mats);
      setVendors(vends);
      setOrphaned(orph);

      const mf: MatFormState = {};
      for (const m of mats) {
        mf[m.id] = { limeId: m.lime_material_id, name: m.standardized_name ?? "", dimension: m.dimension ?? "", uom: m.uom ?? "", selectedMergeId: "" };
      }
      setMatForm(mf);

      const vf: VendorFormState = {};
      for (const v of vends) {
        vf[v.id] = { name: v.name, selectedMergeId: "" };
      }
      setVendorForm(vf);

      const sel: Record<string, string> = {};
      for (const o of orph) {
        if (o.suggestions.length > 0) sel[o.rawId] = o.suggestions[0].id;
      }
      setOrphanSelection(sel);

      // Auto-suggest AI for orphans with no suggestions
      orph.filter((o) => o.suggestions.length === 0).forEach((o, idx) => {
        setTimeout(() => triggerAiSuggest(o.rawId, o.vendorNames[0] ?? "", o.suggestions), 800 * idx);
      });
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function resolve(
    type: "material" | "vendor",
    pendingId: string,
    action: "confirm" | "merge",
    extra: Record<string, string> = {}
  ) {
    setSaving(pendingId);
    setGlobalError(null);
    try {
      const res = await fetch("/api/review/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, pendingId, action, ...extra }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed");
      await load();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(null);
    }
  }

  async function resolveOrphan(rawId: string, action: "link" | "skip") {
    setSaving(rawId);
    setGlobalError(null);
    try {
      const res = await fetch("/api/review/resolve-orphan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawId, action, materialId: orphanSelection[rawId] }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed");
      await load();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(null);
    }
  }

  async function createAndLink(rawId: string) {
    const form = newMatForm[rawId];
    if (!form) return;
    setSaving(`create:${rawId}`);
    setGlobalError(null);
    try {
      const res = await fetch("/api/review/create-and-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawId, baseId: form.baseId, dimensionStr: form.dimension || null, standardizedName: form.name, categoryCode: form.category, uom: form.uom }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed");
      await load();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(null);
    }
  }

  function triggerDimPreview(rawId: string, baseId: string, dimension: string) {
    clearTimeout(dimTimers.current[rawId]);
    if (!baseId.trim() || !dimension.trim()) {
      setDimPreview((p) => ({ ...p, [rawId]: undefined as unknown as DimensionPreview }));
      return;
    }
    dimTimers.current[rawId] = setTimeout(async () => {
      const res = await fetch(`/api/dimensions/preview?dim=${encodeURIComponent(dimension)}&base=${encodeURIComponent(baseId)}`);
      const data = await res.json();
      setDimPreview((p) => ({ ...p, [rawId]: data }));
    }, 300);
  }

  async function triggerAiSuggest(rawId: string, vendorName: string, existingSuggestions: OrphanGroup["suggestions"]) {
    setAiSuggesting((p) => ({ ...p, [rawId]: true }));
    setAiError((p) => ({ ...p, [rawId]: "" }));
    try {
      const existingParam = existingSuggestions.map((s) => `${s.lime_material_id}|${s.standardized_name}`).join(",");
      const url = `/api/review/suggest-orphan?rawId=${encodeURIComponent(rawId)}&vendorName=${encodeURIComponent(vendorName)}${existingParam ? `&existingMatches=${encodeURIComponent(existingParam)}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || !data.suggestedBaseId) {
        setAiError((p) => ({ ...p, [rawId]: data.error || "No suggestion returned" }));
        return;
      }
      setAiSuggestion((p) => ({ ...p, [rawId]: data }));
      const form: NewMaterialForm = {
        baseId: data.suggestedBaseId ?? "",
        name: data.suggestedName ?? "",
        category: data.suggestedCategory ?? "",
        uom: data.suggestedUom ?? "",
        dimension: data.suggestedDimension ?? "",
      };
      setNewMatForm((p) => ({ ...p, [rawId]: form }));
      triggerDimPreview(rawId, form.baseId, form.dimension);
    } finally {
      setAiSuggesting((p) => ({ ...p, [rawId]: false }));
    }
  }

  const fmt = (n: number | null) => (n != null ? `$${Number(n).toFixed(2)}` : "—");
  const totalItems = materials.length + vendors.length + orphaned.length;

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-10">
      <div>
        <Link href="/" className="text-sm text-[#5a8a15] dark:text-[#94CE3C] hover:underline">← Dashboard</Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-3">Review</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Confirm new materials and vendors, and link orphaned pricing records to the catalog.
        </p>
      </div>

      {globalError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {globalError}
        </div>
      )}

      {loading && (
        <div className="text-center py-20 text-gray-400">Loading…</div>
      )}

      {!loading && totalItems === 0 && (
        <div className="text-center py-20 space-y-2">
          <div className="text-4xl">✓</div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">All caught up — no items need review.</p>
        </div>
      )}

      {/* NEW MATERIALS */}
      {!loading && materials.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300">
            New materials ({materials.length})
          </h2>
          {materials.map((mat) => {
            const form = matForm[mat.id];
            if (!form) return null;
            const isSaving = saving === mat.id;
            const docSet = new Map<string, { id: string; source_filename: string; vendor_name_raw: string | null }>();
            for (const pr of mat.price_records) {
              if (pr.documents && !docSet.has(pr.documents.id)) docSet.set(pr.documents.id, pr.documents);
            }
            const docs = [...docSet.values()];
            return (
              <div key={mat.id} className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 overflow-hidden">
                <div className="px-5 py-3 border-b border-amber-200 dark:border-amber-800 flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">New material</p>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{mat.standardized_name || mat.lime_material_id}</p>
                    {docs.map((doc) => (
                      <p key={doc.id} className="text-xs text-gray-500 dark:text-gray-400">
                        From{" "}
                        <Link href={`/documents/${doc.id}`} className="text-[#5a8a15] dark:text-[#94CE3C] hover:underline">
                          {doc.source_filename}
                        </Link>
                        {doc.vendor_name_raw && ` · ${doc.vendor_name_raw}`}
                      </p>
                    ))}
                  </div>
                  {mat.categories && (
                    <span className="shrink-0 text-xs rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-gray-600 dark:text-gray-300">
                      {mat.categories.code}
                    </span>
                  )}
                </div>
                <div className="px-5 py-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {(["Material ID", "Name", "Dimension", "UoM"] as const).map((label) => {
                      const key = { "Material ID": "limeId", Name: "name", Dimension: "dimension", UoM: "uom" }[label] as keyof typeof form;
                      return (
                        <div key={label} className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
                          <input
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm font-mono focus:border-[#94CE3C] focus:outline-none focus:ring-1 focus:ring-[#94CE3C]"
                            value={form[key]}
                            onChange={(e) => setMatForm((s) => ({ ...s, [mat.id]: { ...s[mat.id], [key]: e.target.value } }))}
                            disabled={isSaving}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {mat.suggestions.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Or merge with an existing material:</p>
                      <div className="space-y-1">
                        {mat.suggestions.map((s) => (
                          <label key={s.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer text-sm ${form.selectedMergeId === s.id ? "border-[#94CE3C] bg-[#94CE3C]/10" : "border-gray-200 dark:border-gray-700 hover:border-gray-300"}`}>
                            <input type="radio" name={`merge-${mat.id}`} value={s.id} checked={form.selectedMergeId === s.id} onChange={() => setMatForm((st) => ({ ...st, [mat.id]: { ...st[mat.id], selectedMergeId: s.id } }))} className="accent-[#94CE3C]" disabled={isSaving} />
                            <span className="font-mono text-xs text-gray-500 dark:text-gray-400 w-40 shrink-0">{s.lime_material_id}</span>
                            <span className="text-gray-700 dark:text-gray-300 truncate">{s.standardized_name}</span>
                            {s.dimension && <span className="text-xs text-gray-400 shrink-0">{s.dimension}</span>}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => resolve("material", mat.id, "confirm", { newLimeId: form.limeId, newName: form.name, newDimension: form.dimension, newUom: form.uom })}
                      disabled={isSaving}
                      className="rounded-lg bg-[#94CE3C] px-5 py-2 text-sm font-semibold text-white hover:bg-[#7fb832] transition-colors disabled:opacity-50"
                    >
                      {isSaving ? "Saving…" : "Save as new"}
                    </button>
                    {form.selectedMergeId && (
                      <button
                        onClick={() => resolve("material", mat.id, "merge", { mergeTargetId: form.selectedMergeId })}
                        disabled={isSaving}
                        className="rounded-lg border border-gray-300 dark:border-gray-600 px-5 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                      >
                        Merge with selected
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* NEW VENDORS */}
      {!loading && vendors.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300">
            New vendors ({vendors.length})
          </h2>
          {vendors.map((vendor) => {
            const form = vendorForm[vendor.id];
            if (!form) return null;
            const isSaving = saving === vendor.id;
            return (
              <div key={vendor.id} className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10 overflow-hidden">
                <div className="px-5 py-3 border-b border-blue-200 dark:border-blue-800">
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">New vendor</p>
                  {vendor.documents.map((doc) => (
                    <p key={doc.id} className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      From{" "}
                      <Link href={`/documents/${doc.id}`} className="text-[#5a8a15] dark:text-[#94CE3C] hover:underline">
                        {doc.source_filename}
                      </Link>
                    </p>
                  ))}
                </div>
                <div className="px-5 py-4 space-y-4">
                  <div className="space-y-1 max-w-sm">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Vendor name</label>
                    <input
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm focus:border-[#94CE3C] focus:outline-none focus:ring-1 focus:ring-[#94CE3C]"
                      value={form.name}
                      onChange={(e) => setVendorForm((s) => ({ ...s, [vendor.id]: { ...s[vendor.id], name: e.target.value } }))}
                      disabled={isSaving}
                    />
                  </div>

                  {vendor.suggestions.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Or merge with an existing vendor:</p>
                      <div className="space-y-1">
                        {vendor.suggestions.map((s) => (
                          <label key={s.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer text-sm ${form.selectedMergeId === s.id ? "border-[#94CE3C] bg-[#94CE3C]/10" : "border-gray-200 dark:border-gray-700 hover:border-gray-300"}`}>
                            <input type="radio" name={`vmerge-${vendor.id}`} value={s.id} checked={form.selectedMergeId === s.id} onChange={() => setVendorForm((st) => ({ ...st, [vendor.id]: { ...st[vendor.id], selectedMergeId: s.id } }))} className="accent-[#94CE3C]" disabled={isSaving} />
                            <span className="text-gray-700 dark:text-gray-300">{s.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => resolve("vendor", vendor.id, "confirm", { newName: form.name })}
                      disabled={isSaving}
                      className="rounded-lg bg-[#94CE3C] px-5 py-2 text-sm font-semibold text-white hover:bg-[#7fb832] transition-colors disabled:opacity-50"
                    >
                      {isSaving ? "Saving…" : "Confirm vendor"}
                    </button>
                    {form.selectedMergeId && (
                      <button
                        onClick={() => resolve("vendor", vendor.id, "merge", { mergeTargetId: form.selectedMergeId })}
                        disabled={isSaving}
                        className="rounded-lg border border-gray-300 dark:border-gray-600 px-5 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                      >
                        Merge with selected
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* ORPHANED RECORDS */}
      {!loading && orphaned.length > 0 && (
        <section className="space-y-4" id="orphaned">
          <div>
            <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300">
              Orphaned pricing records ({orphaned.length} groups)
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              These price records exist in the database but aren&apos;t linked to any material — they&apos;re invisible to chat queries and comparisons.
            </p>
          </div>
          {orphaned.map((o) => {
            const isSavingLink = saving === o.rawId;
            const isSavingCreate = saving === `create:${o.rawId}`;
            const isBusy = isSavingLink || isSavingCreate;
            const selectedId = orphanSelection[o.rawId] ?? "";
            const suggestion = aiSuggestion[o.rawId];
            const newForm = newMatForm[o.rawId];
            const preview = dimPreview[o.rawId];

            return (
              <div key={o.rawId} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-mono font-semibold text-gray-800 dark:text-gray-200">{o.rawId}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>{o.recordCount} record{o.recordCount !== 1 ? "s" : ""}</span>
                      {o.minPrice != null && (
                        <span>{o.minPrice === o.maxPrice ? fmt(o.minPrice) : `${fmt(o.minPrice)} – ${fmt(o.maxPrice)}`}{o.priceUom ? ` / ${o.priceUom}` : ""}</span>
                      )}
                      {o.earliest && <span>{o.earliest === o.latest ? o.earliest : `${o.earliest} – ${o.latest}`}</span>}
                      {o.vendorNames.length > 0 && <span>{o.vendorNames.join(", ")}</span>}
                    </div>
                    {(o.documents.length > 0 || o.quoteIds.length > 0) && (
                      <div className="flex flex-wrap gap-x-3 mt-1">
                        {o.documents.map((doc) => (
                          <Link key={doc.id} href={`/documents/${doc.id}`} className="text-xs text-[#5a8a15] dark:text-[#94CE3C] hover:underline">
                            {doc.quote_id ? `Quote ${doc.quote_id}` : doc.source_filename}
                          </Link>
                        ))}
                        {o.quoteIds.map((qid) => (
                          <span key={qid} className="text-xs text-gray-400 dark:text-gray-500">Quote {qid}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {!o.isLimeIdPattern && (
                    <span className="shrink-0 text-xs rounded-full bg-gray-200 dark:bg-gray-700 px-2.5 py-0.5 text-gray-500 dark:text-gray-400">raw description</span>
                  )}
                </div>

                <div className="px-5 py-4 space-y-4">
                  {/* Suggestions */}
                  {o.suggestions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Suggested matches:</p>
                      <div className="space-y-1">
                        {o.suggestions.map((s) => (
                          <label key={s.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer text-sm ${selectedId === s.id ? "border-[#94CE3C] bg-[#94CE3C]/10 dark:bg-[#94CE3C]/15" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"}`}>
                            <input
                              type="radio" name={`orphan-${o.rawId}`} value={s.id} checked={selectedId === s.id}
                              onChange={() => { setOrphanSelection((p) => ({ ...p, [o.rawId]: s.id })); setOrphanSearch((p) => ({ ...p, [o.rawId]: "" })); setOrphanResults((p) => ({ ...p, [o.rawId]: [] })); }}
                              className="accent-[#94CE3C] shrink-0" disabled={isBusy}
                            />
                            <span className="font-mono text-xs text-gray-500 dark:text-gray-400 w-40 shrink-0">{s.lime_material_id}</span>
                            <span className="text-gray-700 dark:text-gray-300 truncate">{s.standardized_name}</span>
                            {s.dimension && <span className="text-xs text-gray-400 shrink-0">{s.dimension}</span>}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Manual search */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {o.suggestions.length > 0 ? "Or search for a different material:" : "Search for a material to link these records to:"}
                    </p>
                    <input
                      type="text"
                      placeholder="Search by name or material ID…"
                      value={orphanSearch[o.rawId] ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setOrphanSearch((p) => ({ ...p, [o.rawId]: val }));
                        clearTimeout(searchTimers.current[o.rawId]);
                        if (!val.trim()) { setOrphanResults((p) => ({ ...p, [o.rawId]: [] })); return; }
                        setOrphanSearching((p) => ({ ...p, [o.rawId]: true }));
                        searchTimers.current[o.rawId] = setTimeout(async () => {
                          const res = await fetch(`/api/materials/search?q=${encodeURIComponent(val)}`);
                          const data = await res.json();
                          setOrphanResults((p) => ({ ...p, [o.rawId]: data }));
                          setOrphanSearching((p) => ({ ...p, [o.rawId]: false }));
                        }, 300);
                      }}
                      disabled={isBusy}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-2 text-sm focus:border-[#94CE3C] focus:outline-none focus:ring-1 focus:ring-[#94CE3C] disabled:opacity-50"
                    />
                    {orphanSearching[o.rawId] && <p className="text-xs text-gray-400">Searching…</p>}
                    {(orphanResults[o.rawId]?.length ?? 0) > 0 && (
                      <div className="space-y-1">
                        {orphanResults[o.rawId].map((r) => (
                          <label key={r.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer text-sm ${selectedId === r.id ? "border-[#94CE3C] bg-[#94CE3C]/10 dark:bg-[#94CE3C]/15" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"}`}>
                            <input type="radio" name={`orphan-${o.rawId}`} value={r.id} checked={selectedId === r.id} onChange={() => setOrphanSelection((p) => ({ ...p, [o.rawId]: r.id }))} className="accent-[#94CE3C] shrink-0" disabled={isBusy} />
                            <span className="font-mono text-xs text-gray-500 dark:text-gray-400 w-40 shrink-0">{r.lime_material_id}</span>
                            <span className="text-gray-700 dark:text-gray-300 truncate">{r.standardized_name}</span>
                            {r.dimension && <span className="text-xs text-gray-400 shrink-0">{r.dimension}</span>}
                          </label>
                        ))}
                      </div>
                    )}
                    {!orphanSearching[o.rawId] && (orphanSearch[o.rawId] ?? "").trim() && (orphanResults[o.rawId]?.length ?? 0) === 0 && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 italic">No materials found for &ldquo;{orphanSearch[o.rawId]}&rdquo;.</p>
                    )}
                  </div>

                  {/* Create new */}
                  <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Or create as a new material:</p>
                      {o.suggestions.length > 0 && !suggestion && !aiSuggesting[o.rawId] && (
                        <button onClick={() => triggerAiSuggest(o.rawId, o.vendorNames[0] ?? "", o.suggestions)} className="text-xs text-[#5a8a15] dark:text-[#94CE3C] hover:underline">
                          Suggest ID with AI
                        </button>
                      )}
                    </div>
                    {aiSuggesting[o.rawId] && <p className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">Suggesting ID…</p>}
                    {!aiSuggesting[o.rawId] && aiError[o.rawId] && (
                      <div className="flex items-center gap-3">
                        <p className="text-xs text-red-500">AI suggestion failed: {aiError[o.rawId]}</p>
                        <button onClick={() => triggerAiSuggest(o.rawId, o.vendorNames[0] ?? "", o.suggestions)} className="text-xs text-[#5a8a15] dark:text-[#94CE3C] hover:underline">Retry</button>
                      </div>
                    )}
                    {suggestion && newForm?.baseId && (
                      <>
                        <p className="text-xs text-gray-400 dark:text-gray-500 italic">{suggestion.reasoning}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {(["Base ID", "Name", "Category", "UoM", "Dimension"] as const).map((label) => {
                            const key = { "Base ID": "baseId", Name: "name", Category: "category", UoM: "uom", Dimension: "dimension" }[label] as keyof NewMaterialForm;
                            return (
                              <div key={label} className={`space-y-1 ${label === "Name" || label === "Dimension" ? "col-span-2" : ""}`}>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
                                <input
                                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm font-mono focus:border-[#94CE3C] focus:outline-none focus:ring-1 focus:ring-[#94CE3C] disabled:opacity-50"
                                  value={newForm[key]}
                                  onChange={(e) => {
                                    const updated = { ...newMatForm[o.rawId], [key]: e.target.value };
                                    setNewMatForm((p) => ({ ...p, [o.rawId]: updated }));
                                    if (key === "baseId" || key === "dimension") triggerDimPreview(o.rawId, updated.baseId, updated.dimension);
                                  }}
                                  disabled={isBusy}
                                />
                              </div>
                            );
                          })}
                        </div>
                        {newForm.baseId && (
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {preview ? (
                              <>
                                Will be saved as: <span className="font-mono text-gray-700 dark:text-gray-200 font-semibold">{preview.fullMaterialId}</span>
                                {preview.isNew && <span className="ml-2 text-amber-500">— new dimension ID {preview.dimensionId} will be created</span>}
                              </>
                            ) : newForm.dimension ? (
                              <>Will be saved as: <span className="font-mono">{newForm.baseId}-…</span> (loading…)</>
                            ) : (
                              <>Will be saved as: <span className="font-mono">{newForm.baseId}</span> (add a dimension above)</>
                            )}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex gap-3 pt-1">
                    {selectedId && (
                      <button onClick={() => resolveOrphan(o.rawId, "link")} disabled={isBusy} className="rounded-lg bg-[#94CE3C] px-5 py-2 text-sm font-semibold text-white hover:bg-[#7fb832] transition-colors disabled:opacity-50">
                        {isSavingLink ? "Linking…" : "Link records"}
                      </button>
                    )}
                    {suggestion && newForm?.baseId && (
                      <button onClick={() => createAndLink(o.rawId)} disabled={isBusy} className={`rounded-lg px-5 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${selectedId ? "bg-gray-600 hover:bg-gray-700" : "bg-[#94CE3C] hover:bg-[#7fb832]"}`}>
                        {isSavingCreate ? "Creating…" : "Create & link"}
                      </button>
                    )}
                    {!selectedId && !suggestion && (
                      <button disabled className="rounded-lg bg-[#94CE3C] px-5 py-2 text-sm font-semibold text-white opacity-40 cursor-not-allowed">
                        Link records
                      </button>
                    )}
                    <button onClick={() => resolveOrphan(o.rawId, "skip")} disabled={isBusy} className="rounded-lg border border-gray-200 dark:border-gray-600 px-5 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
                      Skip for now
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}

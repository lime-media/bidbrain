"use client";

import { useState } from "react";
import Link from "next/link";
import LineItemTable from "./LineItemTable";

interface LineItem {
  line_number: number;
  supplier_part_number: string | null;
  supplier_description: string;
  supplier_dimensions: string | null;
  category_code: string;
  lime_material_id: string | null;
  is_new_material?: boolean;
  suggested_lime_material_id?: string | null;
  match_candidates: string[];
  match_confidence: "high" | "medium" | "low";
  unit_price: number;
  price_uom: string;
  quantity: number;
  extended_price: number;
  shipping_cost: number | null;
  break_qty: number | null;
  break_price: number | null;
  lead_time_days: number | null;
  notes: string | null;
}

interface DocRecord {
  id: string;
  doc_type: string;
  source_filename: string;
  vendor_name_raw: string;
  document_date: string;
  quote_id?: string | null;
  payment_terms?: string | null;
  valid_until?: string | null;
  subtotal?: number | null;
  tax?: number | null;
  shipping_total?: number | null;
  total?: number | null;
  extraction_confidence: string;
  notes?: string | null;
  created_at: string;
  extracted_json?: {
    line_items?: LineItem[];
    totals?: { subtotal?: number; tax?: number; shipping?: number; total?: number };
    extraction_flags?: string[];
  } | null;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  options?: string[];
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {options ? (
        <select
          className="w-full rounded border border-gray-200 px-2.5 py-1.5 text-sm focus:border-[#94CE3C] focus:outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          className="w-full rounded border border-gray-200 px-2.5 py-1.5 text-sm focus:border-[#94CE3C] focus:outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

export default function DocumentDetail({ doc }: { doc: DocRecord }) {
  const flags = doc.extracted_json?.extraction_flags ?? [];

  const normalizeItems = (items: LineItem[] | undefined): LineItem[] =>
    (items ?? []).map((item) => ({
      ...item,
      match_candidates: item.match_candidates ?? [],
      shipping_cost: item.shipping_cost ?? null,
      break_qty: item.break_qty ?? null,
      break_price: item.break_price ?? null,
      lead_time_days: item.lead_time_days ?? null,
    }));

  const [docFields, setDocFields] = useState({
    doc_type: doc.doc_type ?? "",
    vendor_name_raw: doc.vendor_name_raw ?? "",
    document_date: doc.document_date ?? "",
    quote_id: doc.quote_id ?? "",
    payment_terms: doc.payment_terms ?? "",
    valid_until: doc.valid_until ?? "",
    notes: doc.notes ?? "",
  });

  const [lineItems, setLineItems] = useState<LineItem[]>(
    normalizeItems(doc.extracted_json?.line_items)
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = {
    subtotal: doc.subtotal ?? doc.extracted_json?.totals?.subtotal ?? null,
    tax: doc.tax ?? doc.extracted_json?.totals?.tax ?? null,
    shipping: doc.shipping_total ?? doc.extracted_json?.totals?.shipping ?? null,
    total: lineItems.reduce((sum, item) => sum + (item.extended_price || 0), 0),
  };

  const confidenceColor =
    doc.extraction_confidence === "high"
      ? "text-green-600"
      : doc.extraction_confidence === "medium"
      ? "text-yellow-600"
      : "text-red-600";

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: { ...docFields, source_filename: doc.source_filename },
          line_items: lineItems,
          totals,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <Link href="/documents" className="text-sm text-[#5a8a15] hover:underline">
        ← All documents
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold break-all">{doc.source_filename || "Document"}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Uploaded {new Date(doc.created_at).toLocaleDateString()}
          </p>
        </div>
        <span className={`text-sm font-medium shrink-0 ml-4 ${confidenceColor}`}>
          {doc.extraction_confidence} confidence
        </span>
      </div>

      {/* Flags */}
      {flags.length > 0 && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">Flags for review</h3>
          <ul className="text-sm text-yellow-700 space-y-1">
            {flags.map((flag, i) => <li key={i}>• {flag}</li>)}
          </ul>
        </div>
      )}

      {/* Editable document metadata */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Field
          label="Document type"
          value={docFields.doc_type}
          onChange={(v) => setDocFields({ ...docFields, doc_type: v })}
          options={["quote", "invoice", "purchase_order", "receipt"]}
        />
        <Field
          label="Vendor"
          value={docFields.vendor_name_raw}
          onChange={(v) => setDocFields({ ...docFields, vendor_name_raw: v })}
        />
        <Field
          label="Date"
          value={docFields.document_date}
          onChange={(v) => setDocFields({ ...docFields, document_date: v })}
          type="date"
        />
        <Field
          label="Quote / Ref #"
          value={docFields.quote_id}
          onChange={(v) => setDocFields({ ...docFields, quote_id: v })}
        />
        <Field
          label="Payment terms"
          value={docFields.payment_terms}
          onChange={(v) => setDocFields({ ...docFields, payment_terms: v })}
        />
        <Field
          label="Valid until"
          value={docFields.valid_until}
          onChange={(v) => setDocFields({ ...docFields, valid_until: v })}
          type="date"
        />
      </div>

      {/* Line items */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Line Items ({lineItems.length})
        </h2>
        {lineItems.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No line items recorded</p>
        ) : (
          <LineItemTable items={lineItems} onChange={setLineItems} />
        )}
      </div>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="text-sm space-y-1 text-right text-gray-600">
          {totals.subtotal != null && (
            <div>Subtotal: <span className="font-medium">${Number(totals.subtotal).toFixed(2)}</span></div>
          )}
          {totals.tax != null && (
            <div>Tax: <span className="font-medium">${Number(totals.tax).toFixed(2)}</span></div>
          )}
          {totals.shipping != null && (
            <div>Shipping: <span className="font-medium">${Number(totals.shipping).toFixed(2)}</span></div>
          )}
          <div className="border-t pt-1 font-semibold text-gray-900">
            Total: ${totals.total.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Notes</label>
        <textarea
          className="w-full rounded border border-gray-200 px-2.5 py-1.5 text-sm focus:border-[#94CE3C] focus:outline-none resize-none"
          rows={2}
          value={docFields.notes}
          onChange={(e) => setDocFields({ ...docFields, notes: e.target.value })}
          placeholder="Add notes..."
        />
      </div>

      {/* Save */}
      <div className="flex items-center gap-4 pt-2 border-t">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-[#94CE3C] px-8 py-2.5 text-sm font-semibold text-white hover:bg-[#7fb832] transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        {saved && (
          <span className="text-sm text-green-600 font-medium">✓ Changes saved</span>
        )}
        {error && (
          <span className="text-sm text-red-600">{error}</span>
        )}
      </div>
    </main>
  );
}

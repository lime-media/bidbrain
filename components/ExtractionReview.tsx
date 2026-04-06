"use client";

import { useState } from "react";
import LineItemTable from "./LineItemTable";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface ExtractionReviewProps {
  data: any;
  filename: string;
  onConfirm: () => void;
  onReset: () => void;
}

export default function ExtractionReview({
  data,
  filename,
  onConfirm,
  onReset,
}: ExtractionReviewProps) {
  const [doc, setDoc] = useState(data.document);
  const [lineItems, setLineItems] = useState(data.line_items || []);
  const [totals] = useState(data.totals || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confidenceColor =
    data.extraction_confidence === "high"
      ? "text-green-600"
      : data.extraction_confidence === "medium"
      ? "text-yellow-600"
      : "text-red-600";

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: { ...doc, source_filename: filename },
          line_items: lineItems,
          totals,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setSaved(true);
      onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="text-5xl">&#10003;</div>
        <h2 className="text-xl font-semibold text-green-700">
          Document saved successfully
        </h2>
        <p className="text-gray-500">
          {lineItems.length} line item{lineItems.length !== 1 ? "s" : ""} from{" "}
          {doc.vendor_name_normalized} recorded
        </p>
        <button
          onClick={onReset}
          className="mt-4 rounded-lg bg-[#94CE3C] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#7fb832] transition-colors"
        >
          Upload another document
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Extraction Review</h2>
          <p className="text-sm text-gray-500">{filename}</p>
        </div>
        <div className="text-right">
          <span className={`text-sm font-medium ${confidenceColor}`}>
            {data.extraction_confidence} confidence
          </span>
        </div>
      </div>

      {/* Extraction flags */}
      {data.extraction_flags?.length > 0 && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">
            Flags for review
          </h3>
          <ul className="text-sm text-yellow-700 space-y-1">
            {data.extraction_flags.map((flag: string, i: number) => (
              <li key={i}>• {flag}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Document info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field
          label="Document type"
          value={doc.doc_type}
          onChange={(v) => setDoc({ ...doc, doc_type: v })}
          options={["quote", "invoice", "purchase_order", "receipt"]}
        />
        <Field
          label="Vendor"
          value={doc.vendor_name_normalized}
          onChange={(v) => setDoc({ ...doc, vendor_name_normalized: v })}
        />
        <Field
          label="Date"
          value={doc.document_date}
          onChange={(v) => setDoc({ ...doc, document_date: v })}
          type="date"
        />
        <Field
          label="Quote/Ref #"
          value={doc.quote_id || ""}
          onChange={(v) => setDoc({ ...doc, quote_id: v })}
        />
        <Field
          label="Payment terms"
          value={doc.payment_terms || ""}
          onChange={(v) => setDoc({ ...doc, payment_terms: v })}
        />
        <Field
          label="Valid until"
          value={doc.valid_until || ""}
          onChange={(v) => setDoc({ ...doc, valid_until: v })}
          type="date"
        />
      </div>

      {doc.is_new_vendor && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
          New vendor detected: <strong>{doc.vendor_name_normalized}</strong> will
          be added to the database
        </div>
      )}

      {/* Line items */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Line Items ({lineItems.length})
        </h3>
        <LineItemTable items={lineItems} onChange={setLineItems} />
      </div>

      {/* Notes */}
      {doc.notes && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Notes</h3>
          <p className="text-sm text-gray-600">{doc.notes}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 pt-4 border-t">
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="rounded-lg bg-[#94CE3C] px-8 py-2.5 text-sm font-semibold text-white hover:bg-[#7fb832] transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Confirm & Save"}
        </button>
        <button
          onClick={onReset}
          className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Discard & start over
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
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
            <option key={o} value={o}>
              {o}
            </option>
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

"use client";

import { useCallback, useState } from "react";

interface DocumentUploadProps {
  onExtracted: (data: {
    extracted: Record<string, unknown>;
    raw_text: string;
    filename: string;
    fileType: string;
  }) => void;
}

interface ExistingDoc {
  id: string;
  source_filename: string;
  doc_type: string | null;
  document_date: string | null;
  reviewed_at: string | null;
  vendor_name: string | null;
}

export default function DocumentUpload({ onExtracted }: DocumentUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [duplicate, setDuplicate] = useState<ExistingDoc | null>(null);

  const runExtraction = useCallback(
    async (file: File) => {
      setError(null);
      setFilename(file.name);
      setLoading(true);
      setDuplicate(null);
      setPendingFile(null);

      try {
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            ""
          )
        );

        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileBase64: base64,
            fileType: file.type,
            filename: file.name,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Extraction failed");

        onExtracted({
          extracted: data.extracted,
          raw_text: data.raw_text,
          filename: file.name,
          fileType: file.type,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setLoading(false);
      }
    },
    [onExtracted]
  );

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      setDuplicate(null);
      setPendingFile(null);

      // Check for duplicate before running the expensive extraction
      try {
        const res = await fetch(
          `/api/documents/check?filename=${encodeURIComponent(file.name)}`
        );
        const data = await res.json();
        if (data.exists) {
          setPendingFile(file);
          setDuplicate(data.document);
          return;
        }
      } catch {
        // If the check fails, proceed anyway
      }

      await runExtraction(file);
    },
    [runExtraction]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  if (duplicate && pendingFile) {
    const savedDate = duplicate.reviewed_at
      ? new Date(duplicate.reviewed_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;
    const docDate = duplicate.document_date
      ? new Date(duplicate.document_date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;

    return (
      <div className="rounded-xl border-2 border-yellow-400 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">
              This document is already in BidBrain
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              A document with the filename{" "}
              <span className="font-mono text-xs bg-yellow-100 dark:bg-yellow-800 px-1 py-0.5 rounded">
                {duplicate.source_filename}
              </span>{" "}
              was already saved.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-yellow-200 dark:border-yellow-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm space-y-1">
          {duplicate.vendor_name && (
            <div className="flex gap-2">
              <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">Vendor</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">{duplicate.vendor_name}</span>
            </div>
          )}
          {duplicate.doc_type && (
            <div className="flex gap-2">
              <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">Type</span>
              <span className="text-gray-700 dark:text-gray-300 capitalize">{duplicate.doc_type}</span>
            </div>
          )}
          {docDate && (
            <div className="flex gap-2">
              <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">Doc date</span>
              <span className="text-gray-700 dark:text-gray-300">{docDate}</span>
            </div>
          )}
          {savedDate && (
            <div className="flex gap-2">
              <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">Saved on</span>
              <span className="text-gray-700 dark:text-gray-300">{savedDate}</span>
            </div>
          )}
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400">
          Do you want to upload it again anyway? This will create a new entry alongside the existing one.
        </p>

        <div className="flex gap-3">
          <button
            onClick={() => runExtraction(pendingFile)}
            className="rounded-lg bg-[#94CE3C] px-5 py-2 text-sm font-semibold text-white hover:bg-[#7fb832] transition-colors"
          >
            Upload anyway
          </button>
          <button
            onClick={() => {
              setDuplicate(null);
              setPendingFile(null);
            }}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-5 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
        dragging
          ? "border-[#94CE3C] bg-[#94CE3C]/5"
          : "border-gray-300 hover:border-gray-400"
      }`}
    >
      {loading ? (
        <div className="space-y-4">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-[#94CE3C] border-t-transparent" />
          <p className="text-gray-600 dark:text-gray-300 font-medium">
            Extracting data from {filename}...
          </p>
          <p className="text-sm text-gray-400">
            Claude is reading the document and extracting structured data
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-4xl">📄</div>
          <p className="text-gray-600 dark:text-gray-300 font-medium">
            Drag & drop a PDF or image here
          </p>
          <p className="text-sm text-gray-400">
            Quotes, invoices, POs, receipts — PDF, PNG, JPG, or WebP
          </p>
          <label className="inline-block cursor-pointer rounded-lg bg-[#94CE3C] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#7fb832] transition-colors">
            Browse files
            <input
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={handleFileSelect}
            />
          </label>
        </div>
      )}
      {error && (
        <p className="mt-4 text-sm text-red-600 font-medium">{error}</p>
      )}
    </div>
  );
}

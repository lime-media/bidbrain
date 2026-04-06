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

export default function DocumentUpload({ onExtracted }: DocumentUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      setFilename(file.name);
      setLoading(true);

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

        if (!res.ok) {
          throw new Error(data.error || "Extraction failed");
        }

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
          <p className="text-gray-600 font-medium">
            Extracting data from {filename}...
          </p>
          <p className="text-sm text-gray-400">
            Claude is reading the document and extracting structured data
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-4xl">📄</div>
          <p className="text-gray-600 font-medium">
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

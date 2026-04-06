"use client";

import { useState } from "react";
import DocumentUpload from "@/components/DocumentUpload";
import ExtractionReview from "@/components/ExtractionReview";

export default function UploadPage() {
  const [extraction, setExtraction] = useState<{
    extracted: Record<string, unknown>;
    raw_text: string;
    filename: string;
    fileType: string;
  } | null>(null);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-2">Upload Document</h1>
      <p className="text-gray-500 mb-8">
        Upload a quote, invoice, PO, or receipt. Bid Brain will extract the data
        for your review.
      </p>

      {!extraction ? (
        <DocumentUpload onExtracted={setExtraction} />
      ) : (
        <ExtractionReview
          data={extraction.extracted}
          filename={extraction.filename}
          onConfirm={() => {}}
          onReset={() => setExtraction(null)}
        />
      )}
    </main>
  );
}

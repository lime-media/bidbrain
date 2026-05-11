import { getSupabaseServer } from "@/lib/supabase";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const supabase = getSupabaseServer();

  const { data: docs } = await supabase
    .from("documents")
    .select("id, source_filename, vendor_name_raw, doc_type, document_date, total, extraction_confidence, created_at")
    .order("created_at", { ascending: false });

  const docList = docs || [];

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-gray-500 mt-1">{docList.length} document{docList.length !== 1 ? "s" : ""} uploaded</p>
        </div>
        <Link
          href="/upload"
          className="rounded-xl bg-[#94CE3C] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#7fb832] transition-colors"
        >
          Upload new
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {docList.map((doc) => (
              <tr
                key={doc.id}
                className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <td className="px-4 py-2.5 max-w-[260px]">
                  <Link
                    href={`/documents/${doc.id}`}
                    className="font-medium text-[#5a8a15] hover:underline block truncate"
                    title={doc.source_filename}
                  >
                    {doc.source_filename || "—"}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">
                  {doc.vendor_name_raw || "—"}
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-block rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                    {doc.doc_type}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-500">{doc.document_date || "—"}</td>
                <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">
                  {doc.total != null ? `$${Number(doc.total).toFixed(2)}` : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`text-xs font-medium ${
                      doc.extraction_confidence === "high"
                        ? "text-green-600"
                        : doc.extraction_confidence === "medium"
                        ? "text-yellow-600"
                        : "text-red-600"
                    }`}
                  >
                    {doc.extraction_confidence}
                  </span>
                </td>
              </tr>
            ))}

            {docList.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  No documents uploaded yet.{" "}
                  <Link href="/upload" className="text-[#5a8a15] hover:underline">
                    Upload one now.
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

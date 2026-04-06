"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import Link from "next/link";

interface Stats {
  documents: number;
  vendors: number;
  materials: number;
  recentDocs: {
    id: string;
    source_filename: string;
    vendor_name_raw: string;
    doc_type: string;
    document_date: string;
    created_at: string;
  }[];
}

export default function DashboardCards() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowser();

      const [docCount, vendorCount, matCount, recentDocs] = await Promise.all([
        supabase.from("documents").select("*", { count: "exact", head: true }),
        supabase.from("vendors").select("*", { count: "exact", head: true }),
        supabase.from("materials").select("*", { count: "exact", head: true }),
        supabase
          .from("documents")
          .select("id, source_filename, vendor_name_raw, doc_type, document_date, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      setStats({
        documents: docCount.count || 0,
        vendors: vendorCount.count || 0,
        materials: matCount.count || 0,
        recentDocs: recentDocs.data || [],
      });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-gray-100" />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-gray-100" />
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    { label: "Documents", value: stats.documents, color: "border-[#4B1F93]" },
    { label: "Vendors", value: stats.vendors, color: "border-[#94CE3C]" },
    { label: "Materials", value: stats.materials, color: "border-blue-400" },
  ];

  return (
    <div className="space-y-8">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-xl border-l-4 ${card.color} bg-white p-6 shadow-sm`}
          >
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="text-3xl font-bold mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="flex gap-4">
        <Link
          href="/upload"
          className="rounded-xl bg-[#94CE3C] px-6 py-3 text-sm font-semibold text-white hover:bg-[#7fb832] transition-colors"
        >
          Upload a document
        </Link>
        <Link
          href="/chat"
          className="rounded-xl bg-[#4B1F93] px-6 py-3 text-sm font-semibold text-white hover:bg-[#3d1877] transition-colors"
        >
          Ask Bid Brain
        </Link>
      </div>

      {/* Recent uploads */}
      {stats.recentDocs.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Recent Uploads</h2>
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentDocs.map((doc) => (
                  <tr
                    key={doc.id}
                    className="border-t border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-2.5 font-medium">
                      {doc.source_filename || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {doc.vendor_name_raw || "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                        {doc.doc_type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {doc.document_date || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

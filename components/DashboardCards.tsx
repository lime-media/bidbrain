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
          .limit(50),
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
    { label: "Documents", value: stats.documents, icon: "📄", href: "/documents" },
    { label: "Vendors", value: stats.vendors, icon: "🏢", href: "/vendors" },
    { label: "Materials", value: stats.materials, icon: "📦", href: "/materials" },
  ];

  return (
    <div className="space-y-8">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-[#94CE3C] transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-500">{card.label}</p>
              <span className="text-xl">{card.icon}</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{card.value}</p>
            <div className="mt-3 flex items-center justify-between">
              <div className="h-1 w-12 rounded-full bg-[#94CE3C]" />
              <span className="text-xs text-[#5a8a15] opacity-0 group-hover:opacity-100 transition-opacity">View all →</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick links */}
      <div className="flex gap-4">
        <Link
          href="/upload"
          className="rounded-xl bg-[#94CE3C] px-6 py-3 text-sm font-semibold text-white hover:bg-[#7fb832] transition-colors shadow-sm"
        >
          Upload a document
        </Link>
        <Link
          href="/chat"
          className="rounded-xl border-2 border-[#94CE3C] px-6 py-3 text-sm font-semibold text-[#5a8a15] hover:bg-[#94CE3C]/10 transition-colors"
        >
          Ask Bid Brain
        </Link>
      </div>

      {/* Recent uploads */}
      {stats.recentDocs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Recent Uploads</h2>
            <Link href="/documents" className="text-sm text-[#5a8a15] hover:underline font-medium">
              View all →
            </Link>
          </div>
          <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                  <th className="px-4 py-3 font-semibold">File</th>
                  <th className="px-4 py-3 font-semibold">Vendor</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentDocs.map((doc) => (
                  <tr
                    key={doc.id}
                    className="border-t border-gray-100 hover:bg-[#94CE3C]/5 transition-colors"
                  >
                    <td className="px-4 py-3 max-w-[260px]">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="font-medium text-[#5a8a15] hover:underline block truncate"
                        title={doc.source_filename}
                      >
                        {doc.source_filename || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {doc.vendor_name_raw || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-full bg-[#94CE3C]/15 px-2.5 py-0.5 text-xs font-medium text-[#5a8a15]">
                        {doc.doc_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
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

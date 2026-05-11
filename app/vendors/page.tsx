import { getSupabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const supabase = getSupabaseServer();

  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, name, contact_name, contact_email, contact_phone, address, is_active")
    .order("name");

  const list = vendors || [];
  const active = list.filter((v) => v.is_active).length;

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
        <p className="text-gray-500 mt-1">
          {list.length} vendor{list.length !== 1 ? "s" : ""} &middot; {active} active
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Contact</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">Address</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {list.map((vendor) => (
              <tr
                key={vendor.id}
                className="border-t border-gray-100 hover:bg-[#94CE3C]/5 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-gray-900">{vendor.name || "—"}</td>
                <td className="px-4 py-3 text-gray-600">{vendor.contact_name || "—"}</td>
                <td className="px-4 py-3 text-gray-600">
                  {vendor.contact_email ? (
                    <a
                      href={`mailto:${vendor.contact_email}`}
                      className="text-[#5a8a15] hover:underline"
                    >
                      {vendor.contact_email}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{vendor.contact_phone || "—"}</td>
                <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate" title={vendor.address || ""}>
                  {vendor.address || "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      vendor.is_active
                        ? "bg-[#94CE3C]/15 text-[#5a8a15]"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {vendor.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}

            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  No vendors found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

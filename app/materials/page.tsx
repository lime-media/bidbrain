import { getSupabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  const supabase = getSupabaseServer();

  const { data: materials } = await supabase
    .from("materials")
    .select("id, lime_material_id, standardized_name, dimension, uom, temper_code, is_active, categories(code, name)")
    .order("lime_material_id");

  type MatRow = {
    id: string;
    lime_material_id: string;
    standardized_name: string;
    dimension: string | null;
    uom: string;
    temper_code: string | null;
    is_active: boolean;
    categories: { code: string; name: string } | { code: string; name: string }[] | null;
  };

  const list = (materials || []) as unknown as MatRow[];

  const active = list.filter((m) => m.is_active).length;

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Materials</h1>
        <p className="text-gray-500 mt-1">
          {list.length} material{list.length !== 1 ? "s" : ""} &middot; {active} active
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
              <th className="px-4 py-3 font-semibold">Material ID</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">Dimension</th>
              <th className="px-4 py-3 font-semibold">UoM</th>
              <th className="px-4 py-3 font-semibold">Temper</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {list.map((mat) => (
              <tr
                key={mat.id}
                className="border-t border-gray-100 hover:bg-[#94CE3C]/5 transition-colors"
              >
                <td className="px-4 py-2.5">
                  <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">
                    {mat.lime_material_id}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-900 font-medium">{mat.standardized_name || "—"}</td>
                <td className="px-4 py-2.5">
                  {(() => {
                    const cat = Array.isArray(mat.categories) ? mat.categories[0] : mat.categories;
                    return cat ? (
                      <span className="inline-block rounded-full bg-[#94CE3C]/15 px-2.5 py-0.5 text-xs font-medium text-[#5a8a15]">
                        {cat.code}
                      </span>
                    ) : "—";
                  })()}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{mat.dimension || "—"}</td>
                <td className="px-4 py-2.5 text-gray-600">{mat.uom || "—"}</td>
                <td className="px-4 py-2.5 text-gray-500">{mat.temper_code || "—"}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      mat.is_active
                        ? "bg-[#94CE3C]/15 text-[#5a8a15]"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {mat.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}

            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  No materials found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

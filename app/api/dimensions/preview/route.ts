import { getSupabaseServer } from "@/lib/supabase";

function normalizeDim(dim: string): string {
  return dim.toLowerCase().replace(/\s+/g, "").replace(/[×x]/g, "x").replace(/"/g, "").trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dim = searchParams.get("dim") ?? "";
  const base = searchParams.get("base") ?? "";
  if (!dim || !base) return Response.json(null);

  const supabase = getSupabaseServer();
  const { data: dims } = await supabase.from("dimensions").select("id, dimension").order("id");
  const rows = dims ?? [];
  const needle = normalizeDim(dim);

  const existing = rows.find((r) => normalizeDim(r.dimension) === needle);
  if (existing) {
    return Response.json({ fullMaterialId: `${base}-${existing.id}`, isNew: false, dimensionId: existing.id });
  }

  const nextId = rows.length > 0 ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
  return Response.json({ fullMaterialId: `${base}-${nextId}`, isNew: true, dimensionId: nextId });
}

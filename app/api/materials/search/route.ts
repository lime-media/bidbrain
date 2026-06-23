import { getSupabaseServer } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  if (!q.trim()) return Response.json([]);

  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from("materials")
    .select("id, lime_material_id, standardized_name, dimension")
    .or(`lime_material_id.ilike.%${q}%,standardized_name.ilike.%${q}%`)
    .eq("is_active", true)
    .limit(10);

  return Response.json(data ?? []);
}

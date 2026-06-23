import { getSupabaseServer } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { rawId, action, materialId } = await request.json();
    const supabase = getSupabaseServer();

    if (action === "link") {
      if (!materialId) return Response.json({ error: "materialId required" }, { status: 400 });
      const { error } = await supabase
        .from("price_records")
        .update({ material_id: materialId })
        .eq("lime_material_id_raw", rawId)
        .is("material_id", null);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (action === "skip") {
      await supabase
        .from("price_records")
        .update({ is_skipped: true })
        .eq("lime_material_id_raw", rawId)
        .is("material_id", null);
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("resolve-orphan error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

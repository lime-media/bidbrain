import { getSupabaseServer } from "@/lib/supabase";
import { resolveFinalMaterialId } from "@/lib/dimensions";

export async function POST(request: Request) {
  try {
    const { rawId, baseId, dimensionStr, standardizedName, categoryCode, uom } = await request.json();
    const supabase = getSupabaseServer();

    const finalId = await resolveFinalMaterialId(supabase, baseId, dimensionStr || null);

    const { data: existing } = await supabase
      .from("materials")
      .select("id")
      .eq("lime_material_id", finalId)
      .single();

    let materialId: string;
    if (existing) {
      materialId = existing.id;
    } else {
      const { data: category } = await supabase
        .from("categories")
        .select("id")
        .eq("code", categoryCode)
        .single();

      const { data: newMat, error } = await supabase
        .from("materials")
        .insert({
          lime_material_id: finalId,
          standardized_name: standardizedName || null,
          dimension: dimensionStr || null,
          uom: uom || null,
          category_id: category?.id ?? null,
          is_active: true,
        })
        .select("id")
        .single();

      if (error || !newMat) throw error ?? new Error("Failed to create material");
      materialId = newMat.id;
    }

    const { error: linkErr } = await supabase
      .from("price_records")
      .update({ material_id: materialId })
      .eq("lime_material_id_raw", rawId)
      .is("material_id", null);

    if (linkErr) throw linkErr;

    return Response.json({ ok: true, materialId, finalId });
  } catch (err) {
    console.error("create-and-link error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

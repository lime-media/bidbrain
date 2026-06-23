import { getSupabaseServer } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, pendingId, action, ...extra } = body;
    const supabase = getSupabaseServer();

    if (type === "material") {
      if (action === "confirm") {
        const { newLimeId, newName, newDimension, newUom } = extra;
        const { error } = await supabase
          .from("materials")
          .update({
            lime_material_id: newLimeId,
            standardized_name: newName || null,
            dimension: newDimension || null,
            uom: newUom || null,
            is_active: true,
            needs_review: false,
          })
          .eq("id", pendingId);
        if (error) throw error;
        return Response.json({ ok: true });
      }

      if (action === "merge") {
        const { mergeTargetId } = extra;
        await supabase.from("price_records").update({ material_id: mergeTargetId }).eq("material_id", pendingId);
        await supabase.from("vendor_materials").update({ material_id: mergeTargetId }).eq("material_id", pendingId);
        await supabase.from("materials").delete().eq("id", pendingId);
        return Response.json({ ok: true });
      }
    }

    if (type === "vendor") {
      if (action === "confirm") {
        const { newName } = extra;
        const { error } = await supabase
          .from("vendors")
          .update({ name: newName, is_active: true, needs_review: false })
          .eq("id", pendingId);
        if (error) throw error;
        return Response.json({ ok: true });
      }

      if (action === "merge") {
        const { mergeTargetId } = extra;
        await supabase.from("documents").update({ vendor_id: mergeTargetId }).eq("vendor_id", pendingId);
        await supabase.from("price_records").update({ vendor_id: mergeTargetId }).eq("vendor_id", pendingId);
        await supabase.from("vendor_materials").delete().eq("vendor_id", pendingId);
        await supabase.from("vendors").delete().eq("id", pendingId);
        return Response.json({ ok: true });
      }
    }

    return Response.json({ error: "Unknown type or action" }, { status: 400 });
  } catch (err) {
    console.error("resolve error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

import { getSupabaseServer } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { document, line_items, totals } = await request.json();
    const supabase = getSupabaseServer();

    // 1. Resolve or create vendor
    let vendor_id: string | null = null;
    const { data: existingVendor } = await supabase
      .from("vendors")
      .select("id")
      .ilike("name", document.vendor_name_normalized)
      .single();

    if (existingVendor) {
      vendor_id = existingVendor.id;
    } else {
      const { data: newVendor, error: vendorErr } = await supabase
        .from("vendors")
        .insert({ name: document.vendor_name_normalized, is_active: true })
        .select("id")
        .single();
      if (vendorErr) throw vendorErr;
      vendor_id = newVendor!.id;
    }

    // 2. Insert document
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .insert({
        doc_type: document.doc_type,
        source_filename: document.source_filename,
        vendor_name_raw: document.vendor_name_raw,
        vendor_id,
        document_date: document.document_date,
        quote_id: document.quote_id,
        payment_terms: document.payment_terms,
        valid_until: document.valid_until,
        subtotal: totals.subtotal,
        tax: totals.tax,
        shipping_total: totals.shipping,
        total: totals.total,
        extracted_json: { document, line_items, totals },
        extraction_confidence: document.extraction_confidence || "medium",
        submitted_by: document.submitted_by || "unknown",
        reviewed: true,
        reviewed_at: new Date().toISOString(),
        notes: document.notes,
      })
      .select("id")
      .single();

    if (docErr) throw docErr;

    // 3. Insert price records for each line item
    for (const item of line_items) {
      // Skip fee-type items for material matching
      let material_id: string | null = null;
      if (item.lime_material_id) {
        const { data: mat } = await supabase
          .from("materials")
          .select("id")
          .eq("lime_material_id", item.lime_material_id)
          .single();
        material_id = mat?.id || null;
      }

      // Ensure vendor_materials mapping exists
      if (material_id && vendor_id) {
        const { data: existingVm } = await supabase
          .from("vendor_materials")
          .select("id")
          .eq("material_id", material_id)
          .eq("vendor_id", vendor_id)
          .limit(1)
          .single();

        if (!existingVm) {
          await supabase.from("vendor_materials").insert({
            material_id,
            vendor_id,
            supplier_part_number: item.supplier_part_number,
            supplier_description: item.supplier_description,
            supplier_dimensions: item.supplier_dimensions,
            supplier_uom: item.price_uom,
            is_active: true,
          });
        }
      }

      await supabase.from("price_records").insert({
        material_id,
        vendor_id,
        document_id: doc!.id,
        lime_material_id_raw: item.lime_material_id || item.supplier_description,
        quote_id: document.quote_id,
        quote_date: document.document_date,
        unit_price: item.unit_price,
        price_uom: item.price_uom,
        quantity: item.quantity,
        extended_price: item.extended_price,
        shipping_cost: item.shipping_cost,
        break_qty: item.break_qty,
        break_price: item.break_price,
        status: "quoted",
        match_confidence: item.match_confidence,
        notes: item.notes,
      });
    }

    return Response.json({ success: true, document_id: doc!.id });
  } catch (error) {
    console.error("Confirm error:", error);
    return Response.json(
      { error: "Failed to save document" },
      { status: 500 }
    );
  }
}

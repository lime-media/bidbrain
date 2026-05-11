import { getSupabaseServer } from "@/lib/supabase";
import { resolveFinalMaterialId } from "@/lib/dimensions";

function normalizeVendorName(raw: string): string {
  return raw
    .replace(
      /\b(LLC|LLP|LP|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|DBA|D\/B\/A|LTD|LIMITED|GROUP|SUPPLY|SUPPLIES|INTERNATIONAL|INTL)\b\.?/gi,
      ""
    )
    .replace(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/g, "")
    .replace(/[,\.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { document, line_items, totals } = await request.json();
    const supabase = getSupabaseServer();

    // 1. Resolve vendor
    let vendor_id: string | null = null;
    const normalizedName = normalizeVendorName(document.vendor_name_raw || "");

    const { data: existingVendor } = await supabase
      .from("vendors")
      .select("id")
      .ilike("name", normalizedName)
      .limit(1)
      .single();

    if (existingVendor) {
      vendor_id = existingVendor.id;
    } else {
      const firstWord = normalizedName.split(" ")[0];
      const { data: fuzzyVendor } = await supabase
        .from("vendors")
        .select("id")
        .ilike("name", `%${firstWord}%`)
        .limit(1)
        .single();

      if (fuzzyVendor) {
        vendor_id = fuzzyVendor.id;
      } else if (normalizedName) {
        const { data: newVendor } = await supabase
          .from("vendors")
          .insert({ name: normalizedName, is_active: true })
          .select("id")
          .single();
        vendor_id = newVendor?.id ?? null;
      }
    }

    // 2. Update the document row
    const { error: docErr } = await supabase
      .from("documents")
      .update({
        doc_type: document.doc_type,
        vendor_name_raw: document.vendor_name_raw,
        vendor_id,
        document_date: document.document_date,
        quote_id: document.quote_id,
        payment_terms: document.payment_terms,
        valid_until: document.valid_until || null,
        subtotal: totals.subtotal ?? null,
        tax: totals.tax ?? null,
        shipping_total: totals.shipping ?? null,
        total: totals.total ?? null,
        extracted_json: { document, line_items, totals },
        notes: document.notes ?? null,
        reviewed: true,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (docErr) throw docErr;

    // 3. Delete existing price_records for this document and re-insert
    await supabase.from("price_records").delete().eq("document_id", id);

    for (const item of line_items) {
      let material_id: string | null = null;

      if (item.lime_material_id) {
        const { data: mat } = await supabase
          .from("materials")
          .select("id")
          .eq("lime_material_id", item.lime_material_id)
          .single();
        material_id = mat?.id ?? null;
      }

      if (!material_id && item.is_new_material && item.suggested_lime_material_id) {
        const finalId = await resolveFinalMaterialId(
          supabase,
          item.suggested_lime_material_id,
          item.supplier_dimensions ?? null
        );

        const { data: existingMat } = await supabase
          .from("materials")
          .select("id")
          .eq("lime_material_id", finalId)
          .single();

        if (existingMat) {
          material_id = existingMat.id;
          item.lime_material_id = finalId;
        } else {
          const { data: category } = await supabase
            .from("categories")
            .select("id")
            .eq("code", item.category_code)
            .single();

          const { data: newMat } = await supabase
            .from("materials")
            .insert({
              lime_material_id: finalId,
              standardized_name: item.supplier_description,
              dimension: item.supplier_dimensions,
              uom: item.price_uom,
              category_id: category?.id ?? null,
              is_active: true,
            })
            .select("id")
            .single();

          if (newMat) {
            material_id = newMat.id;
            item.lime_material_id = finalId;
          }
        }
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
        document_id: id,
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

    return Response.json({ success: true });
  } catch (error) {
    console.error("Document update error:", error);
    return Response.json({ error: "Failed to update document" }, { status: 500 });
  }
}

import { getSupabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabaseServer();

    // === NEW MATERIALS ===
    // Materials deactivated by sync (not in Excel) OR auto-created without a dimension_id,
    // that have price_records from uploaded documents.
    const { data: rawMaterials } = await supabase
      .from("materials")
      .select("id, lime_material_id, standardized_name, dimension, uom, dimension_id, is_active, categories(code)")
      .eq("needs_review", true);

    const materialResults = [];
    for (const mat of rawMaterials ?? []) {
      const { data: prRecs } = await supabase
        .from("price_records")
        .select("id, documents(id, source_filename, vendor_name_raw)")
        .eq("material_id", mat.id)
        .not("document_id", "is", null)
        .limit(5);

      if (!prRecs || prRecs.length === 0) continue;

      const prefix = mat.lime_material_id?.split("-")?.[0] ?? "";
      const { data: suggestions } = prefix
        ? await supabase
            .from("materials")
            .select("id, lime_material_id, standardized_name, dimension")
            .ilike("lime_material_id", `${prefix}-%`)
            .eq("is_active", true)
            .not("id", "eq", mat.id)
            .not("dimension_id", "is", null)
            .limit(5)
        : { data: [] };

      materialResults.push({ ...mat, suggestions: suggestions ?? [], price_records: prRecs });
    }

    // === NEW VENDORS ===
    // Vendors that are inactive (deactivated by sync) but appear in documents.
    const { data: rawVendors } = await supabase
      .from("vendors")
      .select("id, name")
      .eq("needs_review", true);

    const vendorResults = [];
    for (const vendor of rawVendors ?? []) {
      const { data: docs } = await supabase
        .from("documents")
        .select("id, source_filename")
        .eq("vendor_id", vendor.id)
        .limit(3);

      if (!docs || docs.length === 0) continue;

      const firstWord = vendor.name?.split(" ")?.[0] ?? "";
      const { data: suggestions } = firstWord
        ? await supabase
            .from("vendors")
            .select("id, name")
            .ilike("name", `%${firstWord}%`)
            .neq("id", vendor.id)
            .eq("is_active", true)
            .limit(5)
        : { data: [] };

      vendorResults.push({ ...vendor, documents: docs, suggestions: suggestions ?? [] });
    }

    // === ORPHANED PRICE RECORDS ===
    const { data: orphanedRecs } = await supabase
      .from("price_records")
      .select("id, lime_material_id_raw, unit_price, price_uom, quote_date, vendors(name), documents(id, source_filename, quote_id)")
      .is("material_id", null)
      .eq("is_skipped", false);

    type ORecRow = NonNullable<typeof orphanedRecs>[number];
    const groupMap = new Map<string, ORecRow[]>();
    for (const rec of orphanedRecs ?? []) {
      const raw = rec.lime_material_id_raw ?? "UNKNOWN";
      if (!groupMap.has(raw)) groupMap.set(raw, []);
      groupMap.get(raw)!.push(rec);
    }

    const orphanedResults = [];
    for (const [rawId, recs] of groupMap.entries()) {
      const prices = recs.map((r) => Number(r.unit_price)).filter((p) => !isNaN(p) && p > 0);
      const vendorNames = [
        ...new Set(
          recs
            .map((r) => (r.vendors as { name: string } | { name: string }[] | null))
            .map((v) => (Array.isArray(v) ? v[0]?.name : v?.name))
            .filter((n): n is string => !!n)
        ),
      ];
      const dates = recs.map((r) => r.quote_date).filter((d): d is string => !!d).sort();
      const docMap = new Map<string, { id: string; source_filename: string; quote_id: string | null }>();
      const quoteIds = new Set<string>();

      for (const r of recs) {
        const raw = r.documents as { id: string; source_filename: string; quote_id: string | null } | { id: string; source_filename: string; quote_id: string | null }[] | null;
        const doc = Array.isArray(raw) ? raw[0] : raw;
        if (doc) {
          if (!docMap.has(doc.id)) docMap.set(doc.id, doc);
          if (doc.quote_id) quoteIds.add(doc.quote_id);
        }
      }

      const prefix = rawId.split("-")[0];
      const { data: suggestions } = prefix.length >= 2
        ? await supabase
            .from("materials")
            .select("id, lime_material_id, standardized_name, dimension")
            .ilike("lime_material_id", `${prefix}-%`)
            .eq("is_active", true)
            .limit(5)
        : { data: [] };

      orphanedResults.push({
        rawId,
        recordCount: recs.length,
        minPrice: prices.length > 0 ? Math.min(...prices) : null,
        maxPrice: prices.length > 0 ? Math.max(...prices) : null,
        priceUom: recs[0]?.price_uom ?? null,
        earliest: dates[0] ?? null,
        latest: dates[dates.length - 1] ?? null,
        vendorNames,
        documents: [...docMap.values()],
        quoteIds: [...quoteIds],
        isLimeIdPattern: /^[A-Z]{2,}-[A-Z0-9]/.test(rawId),
        suggestions: suggestions ?? [],
      });
    }

    return Response.json({ materials: materialResults, vendors: vendorResults, orphaned: orphanedResults });
  } catch (err) {
    console.error("review GET error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

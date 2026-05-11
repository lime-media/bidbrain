import { extractDocument } from "@/lib/claude";
import { EXTRACTION_SYSTEM_PROMPT } from "@/lib/prompts/extraction";
import { getSupabaseServer } from "@/lib/supabase";

// Allow large PDF uploads (up to 50 MB base64-encoded)
export const maxDuration = 60;

async function buildExtractionPrompt(): Promise<string> {
  const supabase = getSupabaseServer();

  const [materialsRes, vendorsRes, crosswalkRes] = await Promise.all([
    supabase
      .from("materials")
      .select("lime_material_id, standardized_name, dimension, uom")
      .eq("is_active", true)
      .order("lime_material_id"),
    supabase
      .from("vendors")
      .select("name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("vendor_materials")
      .select("supplier_part_number, supplier_description, materials(lime_material_id), vendors(name)")
      .eq("is_active", true)
      .limit(500),
  ]);

  const materials = materialsRes.data ?? [];
  const vendors = vendorsRes.data ?? [];
  const crosswalk = crosswalkRes.data ?? [];

  if (materials.length === 0) return EXTRACTION_SYSTEM_PROMPT;

  // ── Known vendors (dynamic, from DB) ──────────────────────────────────────
  const vendorList = vendors.map((v) => v.name).join(", ");
  const vendorSection = vendorList
    ? `\n\n## KNOWN VENDORS\n\n${vendorList}\n\nThese vendors are already in the database. If the vendor on a document matches one of these (exact or close match), set is_new_vendor: false. Only set is_new_vendor: true for vendors genuinely not on this list.`
    : "";

  // ── Previously confirmed vendor→material mappings ─────────────────────────
  type CrosswalkRow = {
    supplier_part_number: string | null;
    supplier_description: string | null;
    materials: { lime_material_id: string } | { lime_material_id: string }[] | null;
    vendors: { name: string } | { name: string }[] | null;
  };

  const crosswalkRows = (crosswalk as CrosswalkRow[])
    .map((r) => {
      const mat = Array.isArray(r.materials) ? r.materials[0] : r.materials;
      const ven = Array.isArray(r.vendors) ? r.vendors[0] : r.vendors;
      if (!mat?.lime_material_id || !ven?.name) return null;
      const partCol = r.supplier_part_number ? ` (part# ${r.supplier_part_number})` : "";
      return `| ${ven.name} | ${r.supplier_description ?? ""}${partCol} | ${mat.lime_material_id} |`;
    })
    .filter(Boolean)
    .join("\n");

  const crosswalkSection = crosswalkRows
    ? `\n\n## PREVIOUSLY CONFIRMED VENDOR MAPPINGS\n\nThese mappings have been reviewed and confirmed by humans. If the vendor and description match a row below, use that Lime Material ID directly — set lime_material_id to that value, is_new_material: false, and match_confidence: "high".\n\n| Vendor | Supplier Description / Part# | Lime Material ID |\n|--------|------------------------------|------------------|\n${crosswalkRows}`
    : "";

  // ── Materials catalog ──────────────────────────────────────────────────────
  const catalogRows = materials
    .map((m) => `| ${m.lime_material_id} | ${m.standardized_name} | ${m.dimension ?? ""} | ${m.uom} |`)
    .join("\n");

  const catalog = `\n\n## LIME MATERIALS CATALOG

This table is your source of truth for material IDs. Never invent an ID — only use values from the Material ID column below.

### Multi-signal matching strategy

Do NOT give up after checking one field. For every line item, work through all of these signals before concluding there is no match:

1. **Category first** — Use the category_code to narrow the table to a relevant subset (ACR for acrylic, ALU for aluminum, etc.).
2. **Normalize dimensions** — Strip whitespace, ignore leading zeros, treat fractions and decimals as equivalent. ".220 X 48 X 96", "0.220x48x96", and ".220x48x96" all describe the same size. A partial dimension match (e.g. just the thickness ".220") on the right category is a strong signal.
3. **Name keywords** — Scan both the supplier description and the catalog Name column for shared keywords: alloy grade (6061, 3003, 5052), form (sheet, tube, flat bar, angle, rod), finish (mirror, clear, white, tread brite), temper (T6, H22, H32). A multi-keyword overlap is a confident match even if wording differs.
4. **Vendor and document context** — If the vendor specializes in one material family (e.g. an acrylic supplier), weight that heavily when dimensions or names are ambiguous.
5. **Supplier part number** — If present, compare against known naming patterns in the catalog.
6. **Combine signals** — Category + partial dimension + one name keyword is usually enough for a high-confidence match. Category + one keyword alone warrants medium confidence. Do not mark something as unmatched just because the description wording is different from the standardized name.

Only set is_new_material: true after genuinely exhausting all of the above. When you do find a match, set match_confidence to reflect how many signals aligned: high = 3+ signals, medium = 2 signals, low = 1 signal but plausible.

| Material ID | Name | Dimension | UoM |
|-------------|------|-----------|-----|
${catalogRows}

If after all signals no row matches, leave lime_material_id as null, set is_new_material: true, suggest a base ID in suggested_lime_material_id, and list the closest catalog IDs in match_candidates.`;

  return EXTRACTION_SYSTEM_PROMPT + vendorSection + crosswalkSection + catalog;
}

export async function POST(request: Request) {
  // Safely parse the body — plain-text error responses from the server
  // (e.g. payload-too-large from a reverse proxy) will crash JSON.parse,
  // so we read text first and parse manually.
  let body: { fileBase64?: string; fileType?: string; filename?: string };
  try {
    const text = await request.text();
    body = JSON.parse(text);
  } catch {
    return Response.json(
      { error: "Upload failed — the file may be too large. Try splitting it into smaller files or compressing the PDF." },
      { status: 413 }
    );
  }

  const { fileBase64, fileType, filename } = body;

  if (!fileBase64 || !fileType) {
    return Response.json(
      { error: "fileBase64 and fileType are required" },
      { status: 400 }
    );
  }

  // Rough size check: base64 overhead is ~1.33×, so 50 MB file ≈ 67 MB base64
  const estimatedBytes = (fileBase64.length * 3) / 4;
  if (estimatedBytes > 50 * 1024 * 1024) {
    return Response.json(
      { error: "File exceeds the 50 MB limit. Please compress the PDF and try again." },
      { status: 413 }
    );
  }

  try {
    const systemPrompt = await buildExtractionPrompt();
    const { extracted, raw_text } = await extractDocument(
      fileBase64,
      fileType,
      filename ?? "",
      systemPrompt
    );

    if (!extracted) {
      return Response.json(
        { error: "Failed to extract structured data", raw_text },
        { status: 422 }
      );
    }

    return Response.json({ extracted, raw_text });
  } catch (error) {
    console.error("Extraction error:", error);
    return Response.json(
      { error: "Extraction failed — please try again or contact support." },
      { status: 500 }
    );
  }
}

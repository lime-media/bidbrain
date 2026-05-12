import { getSupabaseServer } from "@/lib/supabase";
import * as XLSX from "xlsx";

export const maxDuration = 60;

// ── helpers ──────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function bool(v: unknown): boolean {
  return str(v).toUpperCase() === "Y";
}
function excelDate(serial: unknown): string | null {
  // Try numeric Excel serial first (most common)
  const n = num(serial);
  if (n) {
    try {
      const d = XLSX.SSF.parse_date_code(n);
      if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    } catch { /* fall through */ }
  }
  // Fall back to text date parsing (e.g. "2/25/26", "2025-12-03", "Feb 25 2026")
  const s = str(serial);
  if (!s) return null;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    // Two-digit year "2/25/26" → JS parses as 1926, fix to 2000s
    const y = parsed.getFullYear() < 100 ? parsed.getFullYear() + 2000 : parsed.getFullYear();
    return `${y}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }
  return null;
}
function normalizeVendorName(raw: string): string {
  return raw
    .replace(/\b(LLC|LLP|LP|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|DBA|LTD|LIMITED|GROUP|SUPPLY|SUPPLIES|INTERNATIONAL|INTL)\b\.?/gi, "")
    .replace(/[,.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── sheet parsers ─────────────────────────────────────────────────────────────

async function syncMaterials(supabase: ReturnType<typeof getSupabaseServer>, rows: Record<string, unknown>[]) {
  const { data: cats } = await supabase.from("categories").select("id, name, code");
  const catByName: Record<string, string> = {};
  for (const c of cats ?? []) {
    catByName[c.name.toLowerCase()] = c.id;
  }

  const { data: existing } = await supabase.from("materials").select("lime_material_id");
  const existingSet = new Set((existing ?? []).map((m) => m.lime_material_id));

  const excelSet = new Set<string>();
  let added = 0, updated = 0;

  for (const row of rows) {
    const limeId = str(row["LIME Material ID"]);
    if (!limeId) continue;
    excelSet.add(limeId);

    const categoryName = str(row["Category"]);
    const category_id = catByName[categoryName.toLowerCase()] ?? null;
    const record = {
      lime_material_id: limeId,
      category_id,
      standardized_name: str(row["Standardized Name"]) || null,
      dimension: str(row["Dimension"]) || null,
      dimension_id: num(row["Dimension ID"]),
      uom: str(row["UoM"]) || null,
      is_active: true,
    };

    if (existingSet.has(limeId)) {
      await supabase.from("materials").update(record).eq("lime_material_id", limeId);
      updated++;
    } else {
      await supabase.from("materials").insert(record);
      added++;
    }
  }

  // Mark rows that are no longer in the Excel as inactive
  const toDeactivate = (existing ?? [])
    .map((m) => m.lime_material_id)
    .filter((id) => !excelSet.has(id));
  let deactivated = 0;
  if (toDeactivate.length) {
    await supabase.from("materials").update({ is_active: false }).in("lime_material_id", toDeactivate);
    deactivated = toDeactivate.length;
  }

  return { added, updated, deactivated };
}

async function syncVendorMaterials(supabase: ReturnType<typeof getSupabaseServer>, rows: Record<string, unknown>[]) {
  // Pre-load materials and vendors
  const { data: mats } = await supabase.from("materials").select("id, lime_material_id");
  const matMap: Record<string, string> = {};
  for (const m of mats ?? []) matMap[m.lime_material_id] = m.id;

  const { data: vendorRows } = await supabase.from("vendors").select("id, name");
  const vendorMap: Record<string, string> = {};
  for (const v of vendorRows ?? []) vendorMap[normalizeVendorName(v.name).toLowerCase()] = v.id;

  let added = 0, updated = 0, deactivated = 0;
  const excelKeys = new Set<string>();

  for (const row of rows) {
    const limeId = str(row["LIME Material ID"]);
    const supplierRaw = str(row["Supplier"]);
    const partNum = str(row["Supplier Part #"]);
    if (!limeId || !supplierRaw) continue;

    const material_id = matMap[limeId] ?? null;
    if (!material_id) continue;

    // Resolve or create vendor
    const normalizedVendor = normalizeVendorName(supplierRaw);
    let vendor_id = vendorMap[normalizedVendor.toLowerCase()] ?? null;
    if (!vendor_id) {
      const { data: newV } = await supabase
        .from("vendors")
        .insert({ name: normalizedVendor, is_active: true })
        .select("id")
        .single();
      if (newV) {
        vendor_id = newV.id;
        vendorMap[normalizedVendor.toLowerCase()] = vendor_id;
      }
    }
    if (!vendor_id) continue;

    const key = `${material_id}|${vendor_id}|${partNum}`;
    excelKeys.add(key);

    const record = {
      material_id,
      vendor_id,
      supplier_part_number: partNum || null,
      supplier_description: str(row["Supplier Description"]) || null,
      supplier_dimensions: str(row["Supplier Dimensions (extra)"]) || null,
      supplier_uom: str(row[" Supplier UM"] ?? row["Supplier UM"]) || null,
      internal_uom_conversion: str(row["Conv to Internal UOM (multiplier)"]) || null,
      moq: num(row["MOQ"]),
      mpq: num(row["MPQ (pack multiple)"]),
      spq: num(row["SPQ (std pack)"]),
      lead_time_days: num(row["Lead Time (days)"]),
      is_preferred: bool(row["Preferred Supplier (Y/N)"]),
      is_active: bool(row["Active (Y/N)"]),
      notes: str(row["Notes"]) || null,
    };

    const { error } = await supabase
      .from("vendor_materials")
      .upsert(record, { onConflict: "material_id,vendor_id,supplier_part_number" });

    if (error) {
      added++;
    } else {
      updated++;
    }
  }

  // Mark inactive any vendor_materials rows not present in the Excel
  const { data: allVm } = await supabase
    .from("vendor_materials")
    .select("id, material_id, vendor_id, supplier_part_number")
    .eq("is_active", true);

  const toDeactivate = (allVm ?? []).filter((vm) => {
    const k = `${vm.material_id}|${vm.vendor_id}|${vm.supplier_part_number ?? ""}`;
    return !excelKeys.has(k);
  });
  if (toDeactivate.length) {
    await supabase
      .from("vendor_materials")
      .update({ is_active: false })
      .in("id", toDeactivate.map((v) => v.id));
    deactivated = toDeactivate.length;
  }

  return { added, updated, deactivated };
}

async function syncPriceHistory(supabase: ReturnType<typeof getSupabaseServer>, rows: Record<string, unknown>[]) {
  const { data: mats } = await supabase.from("materials").select("id, lime_material_id");
  const matMap: Record<string, string> = {};
  for (const m of mats ?? []) matMap[m.lime_material_id] = m.id;

  const { data: vends } = await supabase.from("vendors").select("id, name");
  const vendorMap: Record<string, string> = {};
  for (const v of vends ?? []) vendorMap[normalizeVendorName(v.name).toLowerCase()] = v.id;

  // Load existing archive records (document_id IS NULL = imported from Excel)
  const { data: existing } = await supabase
    .from("price_records")
    .select("lime_material_id_raw, quote_id, quote_date, unit_price")
    .is("document_id", null);

  type ExistingKey = { lime_material_id_raw: string; quote_id: string; quote_date: string; unit_price: string };
  const existingSet = new Set(
    (existing ?? []).map((r: ExistingKey) => `${r.lime_material_id_raw}|${r.quote_id}|${r.quote_date}|${r.unit_price}`)
  );

  let added = 0, skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const limeId = str(row["LIME Material ID"]);
    if (!limeId) continue;

    const quoteId = str(num(row["Quote ID"]) ?? row["Quote ID"]);
    const quoteDate = excelDate(row["Quote Date"]);
    const unitPrice = num(row["Price unit"]);

    // Dedup key: normalize unit_price to 4 decimal places to match DB storage
    const priceKey = unitPrice != null ? unitPrice.toFixed(4) : "null";
    const key = `${limeId}|${quoteId}|${quoteDate}|${priceKey}`;

    if (existingSet.has(key)) { skipped++; continue; }

    const supplierRaw = str(row["Supplier Name"]);
    const normalizedVendor = normalizeVendorName(supplierRaw);
    const vendor_id = vendorMap[normalizedVendor.toLowerCase()] ?? null;
    const material_id = matMap[limeId] ?? null;

    const { error } = await supabase.from("price_records").insert({
      material_id,
      vendor_id,
      document_id: null,
      lime_material_id_raw: limeId,
      quote_id: quoteId || null,
      quote_date: quoteDate,
      unit_price: unitPrice,
      price_uom: str(row["Price UOM"]) || null,
      quantity: num(row["QTY"]),
      shipping_cost: num(row["Shipping"]),
      break_qty: num(row["Break Qty"]),
      break_price: num(row["Break Price"]),
      award_date: excelDate(row["Award Date"]),
      sales_order: str(row["Sales Order"]) || null,
      status: "quoted",
      match_confidence: "high",
      notes: str(row["Notes"]) || null,
    });

    if (error) {
      errors.push(`Row ${limeId}/${quoteId}: ${error.message}`);
    } else {
      added++;
    }
  }

  return { added, skipped, errors: errors.length > 0 ? errors : undefined };
}

async function syncDimensions(supabase: ReturnType<typeof getSupabaseServer>, rawRows: unknown[][]) {
  let upserted = 0;
  for (const row of rawRows) {
    const dim = str(row[6]);
    const idVal = num(row[7]);
    if (!dim || idVal == null) continue;
    const { error } = await supabase
      .from("dimensions")
      .upsert({ id: idVal, dimension: dim }, { onConflict: "id" });
    if (!error) upserted++;
  }
  return { upserted };
}

async function syncCategories(supabase: ReturnType<typeof getSupabaseServer>, rawRows: unknown[][]) {
  let upserted = 0;
  for (const row of rawRows) {
    const name = str(row[10]);
    const code = str(row[11]);
    const uom = str(row[14]);
    if (!name || !code) continue;
    const { error } = await supabase
      .from("categories")
      .upsert({ code, name, recommended_uom: uom || null }, { onConflict: "code" });
    if (!error) upserted++;
  }
  return { upserted };
}

// ── main handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return Response.json({ error: "No file uploaded" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });

    const supabase = getSupabaseServer();
    const results: Record<string, unknown> = {};

    // Core_Material_Master
    if (wb.SheetNames.includes("Core_Material_Master")) {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Core_Material_Master"]);
      results.materials = await syncMaterials(supabase, rows);
    }

    // Rosseta Stone
    if (wb.SheetNames.includes("Rosseta Stone")) {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Rosseta Stone"]);
      results.vendor_materials = await syncVendorMaterials(supabase, rows);
    }

    // Historical Pricing ARCHIVE
    if (wb.SheetNames.includes("Historical Pricing ARCHIVE")) {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Historical Pricing ARCHIVE"]);
      results.price_history = await syncPriceHistory(supabase, rows);
    }

    // KEY — dimensions + categories (raw rows needed for multi-column layout)
    if (wb.SheetNames.includes("KEY")) {
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["KEY"], { header: 1 });
      const dataRows = rawRows.slice(1); // skip header
      results.dimensions = await syncDimensions(supabase, dataRows);
      results.categories = await syncCategories(supabase, dataRows);
    }

    return Response.json({ success: true, results });
  } catch (err) {
    console.error("Sync error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

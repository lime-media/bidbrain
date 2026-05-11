import { getSupabaseServer } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof getSupabaseServer>;

/** Strip spaces, unify separators, lowercase, remove trailing * and inch/foot marks */
function normalizeDim(dim: string): string {
  return dim
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[×x]/g, "x")
    .replace(/"/g, "")
    .replace(/\*$/, "")
    .trim();
}

/**
 * For 3-part sheet dimensions where the 2nd and 3rd numbers look like feet
 * (e.g. "3/4x4x10" → "3/4x48x120"), multiply by 12.
 * Skips if width ≥ 24 (already in inches) or if there aren't exactly 3 parts.
 */
function feetToInches(dim: string): string {
  const parts = dim.split("x");
  if (parts.length !== 3) return dim;
  const [thickness, widthStr, lengthStr] = parts;
  const w = parseFloat(widthStr);
  const l = parseFloat(lengthStr);
  if (!isNaN(w) && !isNaN(l) && w >= 2 && w <= 12 && l >= 4 && l <= 20) {
    return `${thickness}x${w * 12}x${l * 12}`;
  }
  return dim;
}

/**
 * Resolves a new material ID from a suggested base slug + dimension string.
 *
 * Handles three cases:
 *   1. suggested is already a full material ID that exists in the DB → use it
 *   2. suggested ends with -number (user typed a complete ID) → use it as-is,
 *      create the material if it doesn't exist yet
 *   3. suggested is a base slug → append the resolved dimension_id
 *
 * Returns the final lime_material_id string.
 */
export async function resolveFinalMaterialId(
  supabase: SupabaseClient,
  suggested: string,
  supplierDimensions: string | null
): Promise<string> {
  // Case 1: exact match in existing materials
  const { data: exact } = await supabase
    .from("materials")
    .select("id")
    .eq("lime_material_id", suggested)
    .limit(1)
    .single();
  if (exact) return suggested;

  // Case 2: suggested already has a numeric suffix → user specified the full ID
  if (/-\d+$/.test(suggested)) return suggested;

  // Case 3: base slug → resolve/create dimension_id and append
  if (!supplierDimensions) return suggested; // no dimension info, return as-is
  const dimId = await resolveOrCreateDimensionId(supabase, supplierDimensions);
  return `${suggested}-${dimId}`;
}

/**
 * Finds an existing dimension_id for a given dimension string (with ft→inch
 * conversion as a fallback), or creates a new entry in the dimensions table
 * and returns its ID.
 */
export async function resolveOrCreateDimensionId(
  supabase: SupabaseClient,
  rawDimension: string
): Promise<number> {
  const { data: allDims } = await supabase
    .from("dimensions")
    .select("id, dimension")
    .order("id");

  const rows = allDims ?? [];
  const needle = normalizeDim(rawDimension);
  const needleConverted = feetToInches(needle);

  for (const row of rows) {
    const stored = normalizeDim(row.dimension);
    if (stored === needle || stored === needleConverted) {
      return row.id;
    }
  }

  // Genuinely new dimension — register it and return the next ID
  const maxId = rows.length > 0 ? Math.max(...rows.map((r) => r.id)) : 0;
  const nextId = maxId + 1;
  await supabase.from("dimensions").insert({ id: nextId, dimension: rawDimension });
  return nextId;
}

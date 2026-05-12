import { getSupabaseServer } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get("filename");

  if (!filename) {
    return Response.json({ exists: false });
  }

  const supabase = getSupabaseServer();

  const { data } = await supabase
    .from("documents")
    .select("id, source_filename, doc_type, document_date, reviewed_at, vendors(name)")
    .eq("source_filename", filename)
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) return Response.json({ exists: false });

  const vendor = Array.isArray(data.vendors) ? data.vendors[0] : data.vendors;

  return Response.json({
    exists: true,
    document: {
      id: data.id,
      source_filename: data.source_filename,
      doc_type: data.doc_type,
      document_date: data.document_date,
      reviewed_at: data.reviewed_at,
      vendor_name: vendor?.name ?? null,
    },
  });
}

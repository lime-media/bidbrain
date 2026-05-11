import { getSupabaseServer } from "@/lib/supabase";
import { notFound } from "next/navigation";
import DocumentDetail from "@/components/DocumentDetail";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DocumentPage({ params }: Props) {
  const { id } = await params;
  const supabase = getSupabaseServer();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, doc_type, source_filename, vendor_name_raw, document_date, quote_id, payment_terms, valid_until, subtotal, tax, shipping_total, total, extraction_confidence, notes, created_at, extracted_json")
    .eq("id", id)
    .single();

  if (!doc) notFound();

  return <DocumentDetail doc={doc} />;
}

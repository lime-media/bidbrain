import { queryChat } from "@/lib/claude";
import { getSupabaseServer } from "@/lib/supabase";
import { QUERY_SYSTEM_PROMPT } from "@/lib/prompts/query";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface MaterialCandidate {
  id: string;
  lime_material_id: string;
  standardized_name: string;
  dimension: string;
  category_code: string;
  uom: string;
}

interface PartNumberMatch {
  material_id: string;
  supplier_part_number: string;
  supplier_description: string | null;
  lime_material_id: string;
  standardized_name: string;
}

// Extract dimension-like patterns from natural language (e.g. "2x4s" → "2x4", "4x8 sheet" → "4x8")
function extractDimensionTerms(text: string): string[] {
  const stripped = text.toLowerCase().replace(/[^a-z0-9]/g, " ");
  const matches = stripped.match(/\b(\d+x\d+(?:x\d+)?)\b/g) ?? [];
  return [...new Set(matches)];
}

// Extract supplier part number patterns (e.g. "PHBIRC408.75", "PMAR408.75")
// Pattern: 2+ uppercase letters immediately followed by digits (no hyphen separator)
function extractSupplierPartNumbers(text: string): string[] {
  const matches = text.match(/\b([A-Z]{2,}\d[A-Z0-9.]*)\b/g) ?? [];
  return [...new Set(matches)];
}

// Pre-search: resolve dimension terms to real material IDs before Claude touches the question.
async function preFetchMaterials(
  supabase: ReturnType<typeof getSupabaseServer>,
  question: string
): Promise<MaterialCandidate[]> {
  const terms = extractDimensionTerms(question);
  if (terms.length === 0) return [];

  const orFilter = terms.map((t) => `dimension_normalized.like.${t}%`).join(",");

  const { data } = await supabase
    .from("v_materials_searchable")
    .select("id, lime_material_id, standardized_name, dimension, category_code, uom")
    .or(orFilter)
    .limit(30);

  return (data as MaterialCandidate[]) ?? [];
}

// Extract quote/invoice/PO numbers from natural language (e.g. "#26309", "quote 525167")
function extractQuoteNumbers(text: string): string[] {
  const matches = text.match(/(?:#|quote\s*#?|invoice\s*#?|po\s*#?|order\s*#?)?\b(\d{4,})\b/gi) ?? [];
  return [...new Set(matches.map((m) => m.replace(/[^0-9]/g, "").trim()).filter((m) => m.length >= 4))];
}

interface QuoteLookupResult {
  found: boolean;
  quote_id: string;
  source: "price_records" | "documents";
  vendor_name: string | null;
  quote_date: string | null;
  item_count: number;
}

// Pre-search: look up quote/invoice numbers in both price_records and documents before Claude runs.
// Prevents Claude from asking "which vendor?" when it should just query directly.
async function preFetchByQuoteId(
  supabase: ReturnType<typeof getSupabaseServer>,
  question: string
): Promise<QuoteLookupResult[]> {
  const candidates = extractQuoteNumbers(question);
  if (candidates.length === 0) return [];

  const results: QuoteLookupResult[] = [];

  for (const qid of candidates) {
    // Check price_records
    const { data: prRows } = await supabase
      .from("price_records")
      .select("quote_id, quote_date, vendors(name)")
      .ilike("quote_id", `%${qid}%`)
      .limit(1);

    if (prRows && prRows.length > 0) {
      const { count } = await supabase
        .from("price_records")
        .select("*", { count: "exact", head: true })
        .ilike("quote_id", `%${qid}%`);
      const row = prRows[0] as unknown as { quote_id: string; quote_date: string; vendors: { name: string } | { name: string }[] | null };
      const vendor = Array.isArray(row.vendors) ? row.vendors[0] : row.vendors;
      results.push({ found: true, quote_id: qid, source: "price_records", vendor_name: vendor?.name ?? null, quote_date: row.quote_date, item_count: count ?? 0 });
      continue;
    }

    // Check documents table
    const { data: docRows } = await supabase
      .from("documents")
      .select("quote_id, document_date, vendors(name)")
      .ilike("quote_id", `%${qid}%`)
      .limit(1);

    if (docRows && docRows.length > 0) {
      const row = docRows[0] as unknown as { quote_id: string; document_date: string; vendors: { name: string } | { name: string }[] | null };
      const vendor = Array.isArray(row.vendors) ? row.vendors[0] : row.vendors;
      results.push({ found: true, quote_id: qid, source: "documents", vendor_name: vendor?.name ?? null, quote_date: row.document_date, item_count: 1 });
      continue;
    }

    // Not found anywhere
    results.push({ found: false, quote_id: qid, source: "price_records", vendor_name: null, quote_date: null, item_count: 0 });
  }

  return results;
}

// Pre-search: resolve supplier part numbers through vendor_materials crosswalk.
// This is the "Rosetta Stone" join — maps e.g. PHBIRC408.75 → LMB-C2-BRCH-44 (material UUID).
// Without this, Claude would look up the crosswalk but stop at the Lime ID instead of
// continuing to price_records, causing false "no data" responses.
async function preFetchByPartNumbers(
  supabase: ReturnType<typeof getSupabaseServer>,
  question: string
): Promise<PartNumberMatch[]> {
  const candidates = extractSupplierPartNumbers(question);
  if (candidates.length === 0) return [];

  // Use .in() instead of .or(ilike) — dots in part numbers like "408.75" break
  // PostgREST's or() dot-delimited parser (column.operator.value).
  const { data } = await supabase
    .from("vendor_materials")
    .select("material_id, supplier_part_number, supplier_description, materials(lime_material_id, standardized_name)")
    .in("supplier_part_number", candidates)
    .limit(20);

  if (!data || data.length === 0) return [];

  return (data as unknown as {
    material_id: string;
    supplier_part_number: string;
    supplier_description: string | null;
    materials: { lime_material_id: string; standardized_name: string } | null;
  }[]).map((row) => ({
    material_id: row.material_id,
    supplier_part_number: row.supplier_part_number,
    supplier_description: row.supplier_description,
    lime_material_id: row.materials?.lime_material_id ?? "",
    standardized_name: row.materials?.standardized_name ?? "",
  }));
}

export async function POST(request: Request) {
  try {
    const { question, history = [], conversationId } = (await request.json()) as {
      question: string;
      history: ChatMessage[];
      conversationId?: string;
    };

    if (!question) {
      return Response.json({ error: "question is required" }, { status: 400 });
    }

    const supabase = getSupabaseServer();

    // Step 1a: Pre-fetch materials matching dimension terms (e.g. "2x4s" → material UUIDs)
    const materialCandidates = await preFetchMaterials(supabase, question);

    // Step 1b: Pre-fetch materials matching supplier part numbers (e.g. "PHBIRC408.75" → material UUIDs)
    const partNumberMatches = await preFetchByPartNumbers(supabase, question);

    // Step 1c: Pre-fetch by quote/invoice/PO number — tells Claude whether the quote exists before it runs
    const quoteMatches = await preFetchByQuoteId(supabase, question);

    let enrichedQuestion = question;

    if (materialCandidates.length > 0) {
      const idList = materialCandidates.map((m) => `'${m.id}'`).join(", ");
      const summary = materialCandidates
        .map((m) => `${m.lime_material_id} — ${m.standardized_name} (${m.dimension}, ${m.category_code})`)
        .join("\n");
      enrichedQuestion =
        `${question}\n\n[CONTEXT: Pre-search resolved the dimension terms in this question to the following materials. Use these exact material IDs when querying price_records — do not search by dimension or name yourself:\nMaterial IDs: ${idList}\nMatched materials:\n${summary}]`;
    }

    const detectedPartNumbers = extractSupplierPartNumbers(question);

    if (partNumberMatches.length > 0) {
      const idList = [...new Set(partNumberMatches.map((m) => `'${m.material_id}'`))].join(", ");
      const summary = partNumberMatches
        .map((m) => `${m.supplier_part_number} → ${m.lime_material_id} — ${m.standardized_name} (material_id: '${m.material_id}')`)
        .join("\n");
      const partContext = `[CONTEXT: Pre-search resolved the supplier part numbers in this question through the vendor_materials crosswalk. These are the exact material_id UUIDs to use in price_records queries — do NOT look them up again, do NOT ask what these part numbers are, proceed directly to pricing:\n${summary}\n\nMaterial IDs for IN clause: ${idList}]`;
      enrichedQuestion = enrichedQuestion === question
        ? `${question}\n\n${partContext}`
        : `${enrichedQuestion}\n\n${partContext}`;
    } else if (detectedPartNumbers.length > 0) {
      // Part number patterns were detected but none matched anything in vendor_materials.
      // Tell Claude so it reports "not found" instead of asking the user for the vendor.
      const notFoundContext = `[CONTEXT: Pre-search already looked up these supplier part numbers in the vendor_materials crosswalk and found NO MATCHES: ${detectedPartNumbers.join(", ")}. Do NOT ask which vendor uses this part number. Instead, tell the user clearly that this part number is not in our vendor crosswalk, and offer to search by material description or vendor name if they have more information.]`;
      enrichedQuestion = enrichedQuestion === question
        ? `${question}\n\n${notFoundContext}`
        : `${enrichedQuestion}\n\n${notFoundContext}`;
    }

    if (quoteMatches.length > 0) {
      const lines = quoteMatches.map((q) => {
        if (q.found) {
          return `Quote/ref "${q.quote_id}" EXISTS in our database (source: ${q.source}, vendor: ${q.vendor_name ?? "unknown"}, date: ${q.quote_date ?? "unknown"}, ${q.item_count} line item(s)). Query ${q.source} WHERE quote_id ILIKE '%${q.quote_id}%' — do NOT ask which vendor, proceed directly to the query.`;
        } else {
          return `Quote/ref "${q.quote_id}" was NOT FOUND in price_records or documents. Do NOT ask which vendor — tell the user this quote number is not in BidBrain yet, and suggest they upload the PDF through the Upload page if they have it.`;
        }
      });
      const quoteContext = `[CONTEXT: Pre-search checked the database for quote/reference numbers mentioned in this question:\n${lines.join("\n")}]`;
      enrichedQuestion = enrichedQuestion === question
        ? `${question}\n\n${quoteContext}`
        : `${enrichedQuestion}\n\n${quoteContext}`;
    }

    // Step 2: Ask Claude to generate SQL (or answer directly for general questions)
    const messages: ChatMessage[] = [
      ...history,
      { role: "user", content: enrichedQuestion },
    ];

    const sqlResponse = await queryChat(QUERY_SYSTEM_PROMPT, messages);

    // Step 3: Extract and execute SQL if present
    const sqlMatch = sqlResponse.match(/"query"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    let queryResults: unknown[] | null = null;
    let sqlQuery: string | null = null;
    let sqlError: string | null = null;

    if (sqlMatch) {
      sqlQuery = sqlMatch[1].replace(/\\"/g, '"').replace(/\\n/g, " ");
      const { data, error } = await supabase.rpc("exec_sql", { sql_query: sqlQuery });
      if (error) {
        sqlError = error.message;
      } else {
        queryResults = data ?? [];
      }
    }

    // Step 4: Interpret results or handle errors
    let answer: string;

    if (queryResults !== null) {
      const isEmpty = Array.isArray(queryResults) && queryResults.length === 0;
      const interpretMessages: ChatMessage[] = [
        { role: "user", content: question },
        { role: "assistant", content: sqlResponse },
        {
          role: "user",
          content: isEmpty
            ? `The database returned no results. Do NOT say "no records found" or mention queries or SQL. Instead ask the user one short, friendly clarifying question to help narrow the search — e.g. ask them to name a vendor, specify the material type, or try a different description. No source citation line.`
            : `Here are the query results:\n${JSON.stringify(queryResults, null, 2)}\n\nInterpret these results and answer the original question in plain language. Do NOT return another JSON query block. Translate everything into human-readable terms — vendor names, material descriptions, dollar amounts. Speak directly to a procurement buyer. End with the required source citation line (e.g. *Source: Lime database — ...*).`,
        },
      ];
      answer = await queryChat(QUERY_SYSTEM_PROMPT, interpretMessages);
    } else if (sqlError) {
      const errorMessages: ChatMessage[] = [
        { role: "user", content: question },
        { role: "assistant", content: sqlResponse },
        {
          role: "user",
          content: `The SQL query failed with error: ${sqlError}\n\nPlease correct the query and try again.`,
        },
      ];
      const correctedResponse = await queryChat(QUERY_SYSTEM_PROMPT, errorMessages);
      const correctedMatch = correctedResponse.match(/"query"\s*:\s*"((?:[^"\\]|\\.)*)"/);

      if (correctedMatch) {
        const correctedSql = correctedMatch[1].replace(/\\"/g, '"').replace(/\\n/g, " ");
        const { data: correctedData, error: correctedError } = await supabase.rpc("exec_sql", {
          sql_query: correctedSql,
        });

        if (!correctedError && correctedData) {
          sqlQuery = correctedSql;
          queryResults = correctedData;
          const interpretMessages: ChatMessage[] = [
            { role: "user", content: question },
            { role: "assistant", content: correctedResponse },
            {
              role: "user",
              content: `Here are the query results:\n${JSON.stringify(correctedData, null, 2)}\n\nInterpret in plain language. No SQL or internal codes. End with the source citation line.`,
            },
          ];
          answer = await queryChat(QUERY_SYSTEM_PROMPT, interpretMessages);
        } else {
          answer =
            "I wasn't able to retrieve that data — the query ran into an error. Try rephrasing your question or asking about a different material or vendor.\n\n*Source: Lime database — query failed*";
        }
      } else {
        answer = correctedResponse;
      }
    } else {
      // No SQL generated — Claude answered directly (general knowledge)
      answer = sqlResponse;
    }

    // Step 5: Save to conversation if needed
    if (conversationId) {
      await supabase.from("messages").insert([
        { conversation_id: conversationId, role: "user", content: question },
        {
          conversation_id: conversationId,
          role: "assistant",
          content: answer,
          sql_query: sqlQuery,
          results: queryResults ?? null,
        },
      ]);
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    }

    return Response.json({ answer, sql: sqlQuery, results: queryResults });
  } catch (error) {
    console.error("Query error:", error);
    return Response.json({ error: "Query failed" }, { status: 500 });
  }
}

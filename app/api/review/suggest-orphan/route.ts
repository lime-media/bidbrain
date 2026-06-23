import { getSupabaseServer } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get("rawId") ?? "";
  const vendorName = searchParams.get("vendorName") ?? "";
  const existingMatches = searchParams.get("existingMatches") ?? "";
  if (!rawId) return Response.json({ error: "rawId required" }, { status: 400 });

  const supabase = getSupabaseServer();
  const { data: cats } = await supabase.from("categories").select("code, name");

  const existingList = existingMatches
    ? existingMatches
        .split(",")
        .map((m) => {
          const [id, name] = m.split("|");
          return `  - ${id}: ${name}`;
        })
        .join("\n")
    : "None found.";

  const catList = (cats ?? []).map((c) => `  ${c.code}: ${c.name}`).join("\n");

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `You are a procurement catalog assistant for Lime Media, a display fabrication company.

A vendor quote contains an item with this raw ID/description: "${rawId}"
Vendor: "${vendorName || "unknown"}"

Potential existing catalog matches already found:
${existingList}

Available material categories:
${catList}

Suggest a proper Lime Material ID base slug (WITHOUT the trailing numeric dimension ID) following the format:
{CATEGORY_CODE}-{GRADE_OR_TYPE}-{OPTIONAL_FORM}

Examples: ALU-6061-T6-MFST, LMB-BB, STL-A500-GR-B-HSS, ACR-CLR-MIRROR

Return only valid JSON (no markdown):
{
  "suggestedBaseId": "...",
  "suggestedName": "...",
  "suggestedCategory": "...",
  "suggestedUom": "...",
  "suggestedDimension": "...",
  "reasoning": "..."
}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return Response.json({ error: "No suggestion returned" }, { status: 500 });

  try {
    return Response.json(JSON.parse(match[0]));
  } catch {
    return Response.json({ error: "Failed to parse suggestion" }, { status: 500 });
  }
}

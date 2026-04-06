import { extractDocument } from "@/lib/claude";
import { EXTRACTION_SYSTEM_PROMPT } from "@/lib/prompts/extraction";

export async function POST(request: Request) {
  try {
    const { fileBase64, fileType, filename } = await request.json();

    if (!fileBase64 || !fileType) {
      return Response.json(
        { error: "fileBase64 and fileType are required" },
        { status: 400 }
      );
    }

    const { extracted, raw_text } = await extractDocument(
      fileBase64,
      fileType,
      filename,
      EXTRACTION_SYSTEM_PROMPT
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
      { error: "Extraction failed" },
      { status: 500 }
    );
  }
}

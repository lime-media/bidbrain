import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const MODEL = "claude-sonnet-4-5";

export async function extractDocument(
  fileBase64: string,
  fileType: string,
  filename: string,
  systemPrompt: string
) {
  const isPdf = fileType === "application/pdf";
  const contentBlock: Anthropic.Messages.ContentBlockParam = isPdf
    ? {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: fileBase64 },
      }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: fileType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: fileBase64,
        },
      };

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          contentBlock,
          {
            type: "text",
            text: `Extract all procurement data from this ${filename || "document"}. Return the structured JSON as specified.`,
          },
        ],
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

  return { extracted, raw_text: text };
}

export async function queryChat(
  systemPrompt: string,
  messages: Anthropic.Messages.MessageParam[]
) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

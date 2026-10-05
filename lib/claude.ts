import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Exported and env-overridable so there is ONE place to change the model.
// It previously lived here as a private const AND as a second hardcoded
// literal in app/api/review/suggest-orphan/route.ts, so an upgrade that
// touched only one left the two silently on different models.
// ANTHROPIC_MODEL lets an environment pin or roll back without a deploy.
export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

/**
 * Pulls the assistant's text out of a response.
 *
 * MUST NOT read content[0]. claude-opus-5-5 returns a THINKING block first and
 * the answer second:
 *
 *   [0] type=thinking
 *   [1] type=text      {"suggestedBaseId": ...}
 *
 * The previous `response.content[0].type === "text" ? ... : ""` therefore
 * yielded an empty string on every call once the model moved off
 * claude-sonnet-4-5 (single text block). That is what made
 * /api/review/suggest-orphan 500 with "No suggestion returned" and made chat
 * return a blank answer — the API call succeeded and was billed; the text was
 * simply never read.
 *
 * Joins ALL text blocks rather than taking the first, since a response may be
 * split across several.
 */
export function textFromResponse(response: Anthropic.Messages.Message): string {
  return response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}


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

  const text = textFromResponse(response);
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
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });

  return textFromResponse(response);
}

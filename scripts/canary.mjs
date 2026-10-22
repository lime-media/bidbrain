/**
 * Builds the backup canary object.
 *
 * Buckets can restrict `allowed_mime_types` — `document-uploads` accepts only
 * PDF and images — so the canary has to be a real file of a type the target
 * bucket accepts, not a .txt placeholder. Where the bucket allows it we emit a
 * genuine (small, valid) PDF carrying its own explanation, so anyone who finds
 * the file in the dashboard can read what it is and why it is there.
 */

/** Escape a string for use inside a PDF literal string. */
function pdfEscape(text) {
  return text.replace(/[\\()]/g, (c) => `\\${c}`);
}

/**
 * A minimal single-page PDF containing `lines`. Offsets in the xref table are
 * computed as the body is assembled, so the result is a structurally valid PDF
 * rather than something that merely starts with %PDF.
 */
function buildPdf(lines) {
  const content =
    "BT\n/F1 11 Tf\n40 750 Td\n14 TL\n" +
    lines.map((l) => `(${pdfEscape(l)}) Tj T*\n`).join("") +
    "ET";

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];

  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

/** 1×1 transparent PNG — the fallback for image-only buckets. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

export const CANARY_PREFIX = "_backup-canary/";

/**
 * Pick a canary format this bucket will actually accept.
 * `allowed_mime_types` of null/empty means the bucket is unrestricted.
 */
export function buildCanary(bucket, createdAt) {
  const allowed = bucket.allowed_mime_types ?? [];
  const accepts = (type) => allowed.length === 0 || allowed.includes(type);

  const lines = [
    "BidBrain storage backup canary",
    "",
    `Bucket:  ${bucket.name}`,
    `Created: ${createdAt}`,
    "",
    "This file exists so the scheduled storage backup and its restore",
    "check always have at least one object to exercise, even when the",
    "bucket is otherwise empty. It is written once and then left alone.",
    "",
    "Workflow: .github/workflows/storage-backup.yml",
    "Deleting it will cause the nightly restore check to fail.",
  ];

  if (accepts("text/plain")) {
    return {
      path: `${CANARY_PREFIX}canary.txt`,
      contentType: "text/plain",
      body: Buffer.from(lines.join("\n") + "\n", "utf8"),
    };
  }

  if (accepts("application/pdf")) {
    return {
      path: `${CANARY_PREFIX}canary.pdf`,
      contentType: "application/pdf",
      body: buildPdf(lines),
    };
  }

  if (accepts("image/png")) {
    return {
      path: `${CANARY_PREFIX}canary.png`,
      contentType: "image/png",
      body: TINY_PNG,
    };
  }

  throw new Error(
    `Cannot build a canary for bucket "${bucket.name}": none of text/plain, ` +
      `application/pdf or image/png are in allowed_mime_types ` +
      `(${allowed.join(", ")}). Add one, or seed a canary by hand.`
  );
}

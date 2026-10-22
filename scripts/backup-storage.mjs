/**
 * Scheduled backup of every Supabase Storage bucket.
 *
 * Writes each object to OUT_DIR/objects/<bucket>/<path> alongside a
 * manifest.json recording size, mimetype and a SHA-256 of the bytes as
 * downloaded. verify-restore.mjs replays that manifest to prove the backup is
 * restorable; the checksums are what make the proof meaningful rather than a
 * file-count comparison.
 *
 * Usage:
 *   node --env-file=.env.local scripts/backup-storage.mjs
 *   OUT_DIR=./backup node scripts/backup-storage.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  listBuckets,
  listObjects,
  download,
  upload,
  exists,
  sha256,
  projectHost,
} from "./storage-api.mjs";
import { buildCanary } from "./canary.mjs";

const OUT_DIR = process.env.OUT_DIR ?? "backup";

/**
 * Every bucket carries one small canary object so the backup *and* the restore
 * check exercise a real round-trip even when the bucket is otherwise empty —
 * which `document-uploads` is today. Without it a scheduled run would archive
 * nothing and silently report success, and the first time anyone discovered the
 * job was broken would be during an actual incident.
 *
 * Written once and left alone on later runs: a canary that is rewritten every
 * night proves only that the most recent write worked, not that an object
 * stored months ago is still retrievable.
 */
async function ensureCanary(bucket) {
  const canary = buildCanary(bucket, new Date().toISOString());
  if (await exists(bucket.name, canary.path)) return false;

  await upload(bucket.name, canary.path, canary.body, canary.contentType);
  console.log(`  + created canary ${canary.path} (${canary.contentType})`);
  return true;
}

/** Object paths come from the API — keep them from escaping OUT_DIR. */
function safeJoin(base, ...parts) {
  const target = path.resolve(base, ...parts);
  if (target !== path.resolve(base) && !target.startsWith(path.resolve(base) + path.sep)) {
    throw new Error(`Refusing to write outside ${base}: ${parts.join("/")}`);
  }
  return target;
}

async function main() {
  const startedAt = new Date().toISOString();
  const buckets = await listBuckets();

  if (buckets.length === 0) {
    console.error("No buckets found — refusing to write an empty backup.");
    process.exit(1);
  }

  const manifest = {
    created_at: startedAt,
    project: projectHost,
    buckets: [],
    objects: [],
  };

  for (const bucket of buckets) {
    console.log(`\nbucket: ${bucket.name} (${bucket.public ? "public" : "private"})`);
    await ensureCanary(bucket);

    const objects = await listObjects(bucket.name);
    let bytes = 0;

    for (const object of objects) {
      const data = await download(bucket.name, object.path);
      const dest = safeJoin(OUT_DIR, "objects", bucket.name, object.path);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, data);

      bytes += data.length;
      manifest.objects.push({
        bucket: bucket.name,
        ...object,
        // Trust the bytes we actually received over the reported size.
        size: data.length,
        sha256: sha256(data),
      });
      console.log(`  ✓ ${object.path} (${data.length} bytes)`);
    }

    manifest.buckets.push({
      name: bucket.name,
      public: bucket.public,
      file_size_limit: bucket.file_size_limit,
      allowed_mime_types: bucket.allowed_mime_types,
      object_count: objects.length,
      bytes,
    });
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  const total = manifest.objects.length;
  const totalBytes = manifest.buckets.reduce((sum, b) => sum + b.bytes, 0);
  console.log(
    `\nBacked up ${total} object(s), ${totalBytes} bytes, across ` +
      `${buckets.length} bucket(s) → ${OUT_DIR}/`
  );
}

main().catch((err) => {
  console.error(`Backup failed: ${err.message}`);
  process.exit(1);
});

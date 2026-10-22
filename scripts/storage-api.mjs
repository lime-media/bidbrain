/**
 * Minimal Supabase Storage REST client.
 *
 * Deliberately dependency-free (built-in fetch + node:crypto) so the backup
 * workflow needs no `npm ci` step — fewer moving parts between a scheduled run
 * and a usable backup, and no supply-chain surface on the one job that has to
 * work when everything else is broken.
 *
 * Supabase's own daily backups and PITR do NOT cover Storage objects — the
 * database only holds metadata about them. That is the gap this script fills.
 * https://supabase.com/docs/guides/platform/backups
 */

import { createHash } from "node:crypto";

// NEXT_PUBLIC_SUPABASE_URL is what `vercel env pull` writes, so a local run
// against .env.local works without re-exporting anything.
const url = (
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
)?.replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
      "Locally: `vercel env pull .env.local` then `node --env-file=.env.local ...`"
  );
  process.exit(1);
}

const authHeaders = {
  apikey: key,
  Authorization: `Bearer ${key}`,
};

async function api(path, init = {}) {
  const res = await fetch(`${url}/storage/v1${path}`, {
    ...init,
    headers: { ...authHeaders, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${body}`);
  }
  return res;
}

/** Hostname of the project being backed up — recorded in the manifest. */
export const projectHost = new URL(url).host;

export function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export async function listBuckets() {
  const res = await api("/bucket");
  return res.json();
}

/**
 * Recursively walk a bucket. The list endpoint is prefix-scoped and returns
 * folders as entries with a null `id`, so directories have to be walked by
 * hand — there is no recursive list in this API version.
 */
export async function listObjects(bucket, prefix = "") {
  const files = [];
  const PAGE = 1000;

  for (let offset = 0; ; offset += PAGE) {
    const res = await api(`/object/list/${encodeURIComponent(bucket)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prefix,
        limit: PAGE,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
    });
    const page = await res.json();

    for (const entry of page) {
      const path = prefix ? `${prefix}${entry.name}` : entry.name;
      if (entry.id === null) {
        // A prefix, not an object — descend into it.
        files.push(...(await listObjects(bucket, `${path}/`)));
      } else {
        files.push({
          path,
          size: entry.metadata?.size ?? null,
          mimetype: entry.metadata?.mimetype ?? null,
          etag: entry.metadata?.eTag ?? null,
          last_modified: entry.updated_at ?? null,
        });
      }
    }

    if (page.length < PAGE) break;
  }

  return files;
}

export async function download(bucket, path) {
  const res = await api(
    `/object/${encodeURIComponent(bucket)}/${encodeURI(path)}`
  );
  return Buffer.from(await res.arrayBuffer());
}

export async function upload(bucket, path, body, contentType) {
  await api(`/object/${encodeURIComponent(bucket)}/${encodeURI(path)}`, {
    method: "POST",
    headers: {
      "Content-Type": contentType ?? "application/octet-stream",
      // Overwrite rather than 409 on re-run — restore tests reuse paths.
      "x-upsert": "true",
    },
    body,
  });
}

export async function remove(bucket, paths) {
  await api(`/object/${encodeURIComponent(bucket)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  });
}

export async function exists(bucket, path) {
  const res = await fetch(
    `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeURI(path)}`,
    { method: "HEAD", headers: authHeaders }
  );
  return res.ok;
}

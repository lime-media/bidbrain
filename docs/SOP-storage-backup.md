# SOP: Storage Bucket Backup and Restore

**Owner:** Engineering
**Applies to:** `bidbrain`
**Last updated:** 2026-10-21

## Purpose

Supabase's automated daily backups and Point-in-Time Recovery **do not cover
Storage objects**. Per Supabase's documentation: *"Database backups do not
include objects you store via the Storage API, as the database only includes
metadata about these objects."* Restoring a database backup also does not bring
back objects deleted after that backup was taken.

This means that without a separate job, nothing backs up the buckets at all.
This SOP describes that job and the restore check that proves it works.

## What runs

`.github/workflows/storage-backup.yml` — daily at 07:00 UTC (~02:00
America/Chicago), plus manual `workflow_dispatch`.

Each run:

1. **Enumerates every bucket** in the project. Buckets are discovered at
   runtime, so a bucket added later is picked up without editing the job.
2. **Ensures a canary object** exists in each bucket (see below).
3. **Downloads every object** to `backup/objects/<bucket>/<path>` and writes
   `backup/manifest.json` with each object's size, mimetype, last-modified and
   a SHA-256 of the bytes as received.
4. **Restores one file** — reads it back out of the archive, writes it into
   Storage at a scratch `_restore-test/<timestamp>/` path, downloads it again,
   and compares the SHA-256 against the manifest. The scratch object is deleted
   afterwards.
5. **Uploads two artifacts**: `storage-backup-<date>` (the archive) and
   `restore-check-<date>` (`restore-check.json`, the audit evidence).

Any checksum mismatch exits non-zero and fails the run.

## Why there is a canary

`document-uploads` is currently **empty**, and no application code reads from
or writes to it — uploads are sent to `app/api/extract/route.ts` as base64,
parsed, and persisted to Postgres as text. The original file bytes are never
retained.

Backing up an empty bucket would succeed every night while proving nothing, and
the restore check would have no file to restore. So each bucket holds one small
canary object at `_backup-canary/` that gives both steps something real to
exercise. It is written once and then left alone — a canary rewritten nightly
would only prove that the most recent write worked, not that an object stored
months ago is still retrievable.

The canary's format is chosen to match the bucket's `allowed_mime_types`.
`document-uploads` only accepts PDF and images, so the canary there is a small
valid PDF that explains what it is.

**Deleting the canary will cause the restore check to fail** until the bucket
has at least one real object.

## Scope limits

- **90-day retention.** GitHub Actions artifacts cap at 90 days. If a longer
  retention period is ever required, the destination has to change — an
  off-platform object store (R2/S3) would be the usual answer.
- **`lime-media/bidbrain` is a public repository, and Actions artifacts on a
  public repo are downloadable by anyone.** This was verified directly: an
  unauthenticated `GET https://api.github.com/repos/lime-media/bidbrain/actions/artifacts`
  returns HTTP 200. Today the archive contains only the canary, so there is
  nothing to expose. The moment the bucket holds real customer documents,
  uploading them as an artifact would publish them to the internet.

  The workflow therefore **fails rather than uploading** if the archive contains
  any non-canary object. The override is the repository variable
  `ALLOW_PUBLIC_ARTIFACTS=true`, but the correct fix is to move the destination
  to a private store (R2/S3, or a private repo) before real documents arrive.
- **Schedules run from the default branch only.** This workflow must be on
  `main` to fire on its cron. On a feature branch it can only be run manually.
- **Inactivity pause.** GitHub disables scheduled workflows in repositories
  with no activity for 60 days, and emails the repo admins when it does.
- **Database is out of scope.** This job covers Storage only. The data that
  actually matters today — 209 rows in `documents` plus `vendors`, `materials`
  and `price_records` — is covered only by Supabase's own backups, which depend
  on the project's plan tier.

## Running it by hand

```sh
vercel env pull .env.local                                  # once
node --env-file=.env.local scripts/backup-storage.mjs
node --env-file=.env.local scripts/verify-restore.mjs
```

The scripts read `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and
`SUPABASE_SERVICE_ROLE_KEY`, and have no npm dependencies.

## Restoring for real

`verify-restore.mjs` is a proof, not a recovery tool — it restores one file to
a scratch path and deletes it. To recover actual lost objects:

1. Download the `storage-backup-<date>` artifact from the workflow run.
2. Confirm the archive is intact: the SHA-256 of each file should match its
   entry in `manifest.json`.
3. Re-upload the needed objects to their original paths. Note that this
   overwrites whatever is at those paths now.

## Credentials

The workflow needs two repository secrets:

| Secret | Value |
| --- | --- |
| `SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` from Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` from Vercel |

The service-role key is used because it is the only key that can read private
buckets; Supabase has no storage-scoped key. It bypasses RLS entirely, so the
same key that backs up the buckets can read and write every table. Rotating it
means updating both Vercel and these repository secrets.

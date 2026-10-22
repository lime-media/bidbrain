/**
 * Restore one file from a backup and prove it came back intact.
 *
 * This is a real restore, not a comparison against the live object: the bytes
 * are read from the backup archive, written back into Storage at a scratch
 * path, downloaded again, and checksummed against the manifest. Comparing the
 * archive to the live copy would only prove the download worked — it would not
 * catch a backup that cannot actually be written back.
 *
 * Exits non-zero on any mismatch so a scheduled run fails loudly rather than
 * reporting a green check over an unrestorable archive.
 *
 * Usage:
 *   node --env-file=.env.local scripts/verify-restore.mjs
 *   BACKUP_DIR=./backup node scripts/verify-restore.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { download, upload, remove, sha256 } from "./storage-api.mjs";
import { CANARY_PREFIX } from "./canary.mjs";

const BACKUP_DIR = process.env.BACKUP_DIR ?? "backup";

function fail(message, evidence) {
  console.error(`\n✗ RESTORE CHECK FAILED: ${message}`);
  if (evidence) console.error(JSON.stringify(evidence, null, 2));
  process.exit(1);
}

async function main() {
  const manifest = JSON.parse(
    await readFile(path.join(BACKUP_DIR, "manifest.json"), "utf8")
  );

  if (manifest.objects.length === 0) {
    fail(
      "backup contains no objects — nothing to restore. The canary should " +
        "have guaranteed at least one; check that backup-storage.mjs ran first."
    );
  }

  // Prefer a real uploaded file over the canary: restoring actual user data is
  // the stronger proof. The canary is the fallback while buckets are empty.
  const target =
    manifest.objects.find((o) => !o.path.startsWith(CANARY_PREFIX)) ??
    manifest.objects[0];

  console.log(`Restoring: ${target.bucket}/${target.path}`);
  console.log(`Expected SHA-256: ${target.sha256}`);

  // 1. Read from the archive and confirm the archive itself is not corrupt.
  const archived = await readFile(
    path.join(BACKUP_DIR, "objects", target.bucket, target.path)
  );
  const archivedHash = sha256(archived);
  if (archivedHash !== target.sha256) {
    fail("archived bytes do not match the manifest checksum", {
      expected: target.sha256,
      archived: archivedHash,
    });
  }
  console.log(`✓ archive intact (${archived.length} bytes)`);

  // 2. Write it back into Storage at a scratch path, then read it back.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const restorePath = `_restore-test/${stamp}/${path.basename(target.path)}`;

  await upload(target.bucket, restorePath, archived, target.mimetype);
  console.log(`✓ restored to ${target.bucket}/${restorePath}`);

  const restored = await download(target.bucket, restorePath);
  const restoredHash = sha256(restored);

  // 3. Clean up the scratch object whether or not the check passed.
  await remove(target.bucket, [restorePath]).catch((err) =>
    console.warn(`  ! could not clean up ${restorePath}: ${err.message}`)
  );

  if (restoredHash !== target.sha256) {
    fail("restored bytes do not match the manifest checksum", {
      expected: target.sha256,
      restored: restoredHash,
    });
  }

  const evidence = {
    checked_at: new Date().toISOString(),
    backup_created_at: manifest.created_at,
    project: manifest.project,
    bucket: target.bucket,
    source_path: target.path,
    restored_to: restorePath,
    bytes: restored.length,
    sha256_expected: target.sha256,
    sha256_restored: restoredHash,
    archive_verified: true,
    round_trip_verified: true,
    result: "PASS",
  };

  await writeFile(
    path.join(BACKUP_DIR, "restore-check.json"),
    JSON.stringify(evidence, null, 2)
  );

  console.log(`✓ round trip verified — ${restoredHash}`);
  console.log(`\nRESTORE CHECK PASSED (${restored.length} bytes)`);
  console.log(`Evidence → ${BACKUP_DIR}/restore-check.json`);
}

main().catch((err) => fail(err.message));

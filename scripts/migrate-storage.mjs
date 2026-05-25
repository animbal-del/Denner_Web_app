/**
 * Supabase Storage Migration Script
 * Copies all files from the old project's storage bucket to the new one.
 *
 * Usage:
 *   node scripts/migrate-storage.mjs
 *
 * Set these env vars before running (or edit the constants below):
 *   OLD_SUPABASE_URL
 *   OLD_SERVICE_ROLE_KEY
 *   NEW_SUPABASE_URL
 *   NEW_SERVICE_ROLE_KEY
 *   BUCKET  (default: property-media)
 */

import { createClient } from '@supabase/supabase-js';

// ── Configuration ─────────────────────────────────────────────
const OLD_URL        = process.env.OLD_SUPABASE_URL        || 'https://hmfjpgytbwpllekwhkpi.supabase.co';
const OLD_KEY        = process.env.OLD_SERVICE_ROLE_KEY    || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtZmpwZ3l0YndwbGxla3doa3BpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDkxODcxOCwiZXhwIjoyMDkwNDk0NzE4fQ.X7oiGjuK8rGSO6cKtTjCZLyihBlPi2zRsk8yzlgeNaE';
const NEW_URL        = process.env.NEW_SUPABASE_URL        || '';   // ← fill in after creating new project
const NEW_KEY        = process.env.NEW_SERVICE_ROLE_KEY    || '';   // ← fill in after creating new project
const BUCKET         = process.env.BUCKET                  || 'property-media';

const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days
const CONCURRENT     = 3;                 // parallel uploads at a time

if (!NEW_URL || !NEW_KEY) {
  console.error('ERROR: Set NEW_SUPABASE_URL and NEW_SERVICE_ROLE_KEY before running.');
  process.exit(1);
}

const oldClient = createClient(OLD_URL, OLD_KEY);
const newClient = createClient(NEW_URL, NEW_KEY);

// ── Helpers ───────────────────────────────────────────────────

async function listAllFiles(prefix = '') {
  const allFiles = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await oldClient.storage
      .from(BUCKET)
      .list(prefix, { limit, offset, sortBy: { column: 'name', order: 'asc' } });

    if (error) throw new Error(`List error at "${prefix}": ${error.message}`);

    const folders = (data || []).filter(item => item.id === null);
    const files   = (data || []).filter(item => item.id !== null);

    for (const file of files) {
      allFiles.push(prefix ? `${prefix}/${file.name}` : file.name);
    }

    for (const folder of folders) {
      const sub = prefix ? `${prefix}/${folder.name}` : folder.name;
      const subFiles = await listAllFiles(sub);
      allFiles.push(...subFiles);
    }

    if (!data || data.length < limit) break;
    offset += limit;
  }

  return allFiles;
}

async function copyFile(storagePath) {
  // Download from old project via signed URL
  const { data: urlData, error: signErr } = await oldClient.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);

  if (signErr || !urlData?.signedUrl) {
    throw new Error(`Could not sign URL for ${storagePath}: ${signErr?.message}`);
  }

  const response = await fetch(urlData.signedUrl);
  if (!response.ok) throw new Error(`Download failed for ${storagePath}: ${response.status}`);

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const buffer = Buffer.from(await response.arrayBuffer());

  // Upload to new project
  const { error: uploadErr } = await newClient.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });

  if (uploadErr) throw new Error(`Upload failed for ${storagePath}: ${uploadErr.message}`);
}

async function runWithConcurrency(tasks, limit) {
  const results = [];
  const executing = new Set();

  for (const task of tasks) {
    const p = task().then(r => { executing.delete(p); return r; });
    executing.add(p);
    results.push(p);
    if (executing.size >= limit) await Promise.race(executing);
  }

  return Promise.allSettled(results);
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 Listing files in old bucket "${BUCKET}"...`);
  let files;
  try {
    files = await listAllFiles('');
  } catch (err) {
    console.error(`\n❌ Cannot list files from old project: ${err.message}`);
    console.error('The storage API may still be blocked. Try again after Supabase support restores it,');
    console.error('or contact support at https://supabase.help');
    process.exit(1);
  }

  console.log(`Found ${files.length} files to migrate.\n`);
  if (!files.length) {
    console.log('Nothing to migrate.');
    return;
  }

  // Ensure bucket exists in new project
  const { error: bucketErr } = await newClient.storage.createBucket(BUCKET, { public: false });
  if (bucketErr && !bucketErr.message.includes('already exists')) {
    console.error('Could not create bucket:', bucketErr.message);
    process.exit(1);
  }

  let done = 0;
  let failed = 0;
  const failures = [];

  const tasks = files.map((path) => async () => {
    try {
      await copyFile(path);
      done++;
      process.stdout.write(`\r✅ ${done}/${files.length} copied  ❌ ${failed} failed`);
    } catch (err) {
      failed++;
      failures.push({ path, error: err.message });
      process.stdout.write(`\r✅ ${done}/${files.length} copied  ❌ ${failed} failed`);
    }
  });

  await runWithConcurrency(tasks, CONCURRENT);

  console.log(`\n\nDone. ${done} copied, ${failed} failed.`);

  if (failures.length) {
    console.log('\nFailed files:');
    failures.forEach(({ path, error }) => console.log(`  ${path} — ${error}`));
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});

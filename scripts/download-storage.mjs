/**
 * Downloads all files from the old Supabase storage bucket to ./storage-backup/
 * Usage: node scripts/download-storage.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { dirname } from 'path';

const URL  = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY || '';

if (!URL || !KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}
const BUCKET = 'property-photos';
const OUT_DIR = './storage-backup';
const CONCURRENT = 3;

const client = createClient(URL, KEY);

function listAllFiles() {
  return JSON.parse(readFileSync('scripts/storage-paths.json', 'utf8'));
}

async function downloadFile(storagePath) {
  const publicUrl = `${URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
  const response = await fetch(publicUrl);
  if (!response.ok) throw new Error(`Download failed for ${storagePath}: HTTP ${response.status}`);
  const localPath = `${OUT_DIR}/${storagePath}`;
  mkdirSync(dirname(localPath), { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(localPath, buffer);
}

async function runWithConcurrency(tasks, limit) {
  const executing = new Set();
  const results = [];
  for (const task of tasks) {
    const p = task().then(r => { executing.delete(p); return r; });
    executing.add(p);
    results.push(p);
    if (executing.size >= limit) await Promise.race(executing);
  }
  return Promise.allSettled(results);
}

async function main() {
  console.log(`\nLoading file list from storage-paths.json...`);
  const files = listAllFiles();
  console.log(`Found ${files.length} files. Downloading to ${OUT_DIR}/\n`);
  if (!files.length) { console.log('Nothing to download.'); return; }

  let done = 0, failed = 0;
  const failures = [];

  const tasks = files.map(path => async () => {
    try {
      await downloadFile(path);
      done++;
    } catch (err) {
      failed++;
      failures.push({ path, error: err.message });
    }
    process.stdout.write(`\r  ${done}/${files.length} downloaded  ${failed} failed`);
  });

  await runWithConcurrency(tasks, CONCURRENT);
  console.log(`\n\nDone. ${done} downloaded, ${failed} failed.`);
  if (failures.length) {
    console.log('\nFailed files:');
    failures.forEach(({ path, error }) => console.log(`  ${path} — ${error}`));
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });

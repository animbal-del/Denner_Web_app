/**
 * Compresses all images in the Supabase storage bucket in-place.
 * Downloads each file, resizes/compresses with Sharp, uploads back.
 *
 * Usage: node scripts/compress-storage.mjs
 *
 * Targets:
 *   JPEG/JPG → quality 80, max 1920px wide
 *   PNG      → quality 80 PNG, max 1920px wide
 */

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { readFileSync } from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}
const BUCKET       = 'property-photos';
const MAX_WIDTH    = 1920;
const JPEG_QUALITY = 80;
const PNG_QUALITY  = 80;
const CONCURRENT   = 3;

const client = createClient(SUPABASE_URL, SERVICE_KEY);

async function downloadFile(storagePath) {
  const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function compressImage(buffer, ext) {
  const img = sharp(buffer).resize({ width: MAX_WIDTH, withoutEnlargement: true });
  if (ext === 'png') {
    return { buffer: await img.png({ quality: PNG_QUALITY, compressionLevel: 9 }).toBuffer(), mime: 'image/png' };
  }
  return { buffer: await img.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer(), mime: 'image/jpeg' };
}

async function uploadFile(storagePath, buffer, mime) {
  const { error } = await client.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: mime,
    upsert: true,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}

function getExt(name) {
  return name.split('.').pop().toLowerCase();
}

async function processFile(storagePath) {
  const ext = getExt(storagePath);
  if (!['jpg', 'jpeg', 'png'].includes(ext)) {
    return { skipped: true };
  }

  const original = await downloadFile(storagePath);
  const { buffer: compressed, mime } = await compressImage(original, ext === 'jpg' ? 'jpeg' : ext);

  const saving = original.length - compressed.length;
  if (saving <= 0) return { skipped: true, reason: 'already optimal' };

  await uploadFile(storagePath, compressed, mime);
  return { originalBytes: original.length, compressedBytes: compressed.length, saving };
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
  const files = JSON.parse(readFileSync('scripts/storage-paths.json', 'utf8'));
  console.log(`\nCompressing ${files.length} files in bucket "${BUCKET}"...\n`);

  let done = 0, skipped = 0, failed = 0;
  let totalOriginal = 0, totalCompressed = 0;
  const failures = [];

  const tasks = files.map(path => async () => {
    try {
      const result = await processFile(path);
      if (result.skipped) {
        skipped++;
      } else {
        done++;
        totalOriginal   += result.originalBytes;
        totalCompressed += result.compressedBytes;
      }
    } catch (err) {
      failed++;
      failures.push({ path, error: err.message });
    }
    process.stdout.write(`\r  ${done} compressed  ${skipped} skipped  ${failed} failed`);
  });

  await runWithConcurrency(tasks, CONCURRENT);

  const savedMB = ((totalOriginal - totalCompressed) / 1024 / 1024).toFixed(1);
  const pct     = totalOriginal ? Math.round((1 - totalCompressed / totalOriginal) * 100) : 0;

  console.log(`\n\nDone.`);
  console.log(`  Compressed : ${done} files`);
  console.log(`  Skipped    : ${skipped} files (already optimal or non-image)`);
  console.log(`  Failed     : ${failed} files`);
  if (totalOriginal > 0) {
    console.log(`  Space saved: ${savedMB} MB (${pct}% reduction)`);
  }

  if (failures.length) {
    console.log('\nFailed files:');
    failures.forEach(({ path, error }) => console.log(`  ${path} — ${error}`));
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });

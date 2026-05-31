/**
 * Compresses all images in property-media/flats/ in-place.
 * Uses authenticated REST API (bypasses public CDN restriction).
 *
 * Structure: flats/{DNR}/{subfolder}/{file}
 *
 * Usage: node scripts/compress-storage.mjs
 */

import sharp from 'sharp';

const BASE_URL    = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars before running.');
  process.exit(1);
}
const BUCKET      = 'property-media';
const MAX_WIDTH   = 1280;
const JPEG_Q      = 70;
const PNG_Q       = 70;
const WEBP_Q      = 70;
const CONCURRENT  = 4;

const AUTH = { Authorization: `Bearer ${SERVICE_KEY}` };

async function listFolder(prefix, limit = 1000) {
  const res = await fetch(`${BASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit }),
  });
  if (!res.ok) throw new Error(`List failed for "${prefix}": ${res.status}`);
  return res.json();
}

async function getAllFiles(prefix = 'flats') {
  const entries = await listFolder(prefix);
  const files = [];
  for (const entry of entries) {
    const fullPath = `${prefix}/${entry.name}`;
    if (entry.id === null) {
      // folder — recurse
      files.push(...await getAllFiles(fullPath));
    } else {
      files.push({ path: fullPath, size: entry.metadata?.size, mime: entry.metadata?.mimetype });
    }
  }
  return files;
}

async function downloadFile(storagePath) {
  const res = await fetch(`${BASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, { headers: AUTH });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadFile(storagePath, buffer, mime) {
  const res = await fetch(`${BASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': mime, 'x-upsert': 'true' },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: HTTP ${res.status} — ${text}`);
  }
}

async function compressImage(buffer) {
  const img = sharp(buffer).resize({ width: MAX_WIDTH, withoutEnlargement: true });
  return { buffer: await img.webp({ quality: WEBP_Q }).toBuffer(), mime: 'image/webp' };
}

async function processFile(file) {
  const { path, mime } = file;
  if (!mime || !mime.startsWith('image/')) {
    return { skipped: true, reason: 'not an image' };
  }
  // Skip files already converted to webp in a previous run
  if (mime === 'image/webp') {
    return { skipped: true, reason: 'already webp' };
  }

  const original = await downloadFile(path);
  const { buffer: compressed, mime: outMime } = await compressImage(original);

  if (compressed.length >= original.length) {
    return { skipped: true, reason: 'already optimal' };
  }

  await uploadFile(path, compressed, outMime);
  return { originalBytes: original.length, compressedBytes: compressed.length };
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
  console.log('\nScanning property-media/flats/ ...');
  const files = await getAllFiles('flats');
  const images = files.filter(f => f.mime && f.mime.startsWith('image/'));
  const others = files.filter(f => !f.mime || !f.mime.startsWith('image/'));

  console.log(`Found ${files.length} files total — ${images.length} images, ${others.length} skipped (video/other)\n`);

  let done = 0, skipped = 0, failed = 0;
  let totalOriginal = 0, totalCompressed = 0;
  const failures = [];

  const tasks = images.map(file => async () => {
    try {
      const result = await processFile(file);
      if (result.skipped) {
        skipped++;
      } else {
        done++;
        totalOriginal   += result.originalBytes;
        totalCompressed += result.compressedBytes;
      }
    } catch (err) {
      failed++;
      failures.push({ path: file.path, error: err.message });
    }
    process.stdout.write(`\r  ${done} compressed  ${skipped} skipped  ${failed} failed`);
  });

  await runWithConcurrency(tasks, CONCURRENT);

  const savedMB  = ((totalOriginal - totalCompressed) / 1024 / 1024).toFixed(1);
  const savedPct = totalOriginal ? Math.round((1 - totalCompressed / totalOriginal) * 100) : 0;

  console.log(`\n\nDone.`);
  console.log(`  Compressed : ${done} images`);
  console.log(`  Skipped    : ${skipped} (already optimal)`);
  console.log(`  Failed     : ${failed}`);
  if (totalOriginal > 0) console.log(`  Space saved: ${savedMB} MB  (${savedPct}% reduction)`);

  if (failures.length) {
    console.log('\nFailed:');
    failures.forEach(({ path, error }) => console.log(`  ${path} — ${error}`));
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });

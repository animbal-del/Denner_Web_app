/**
 * Compresses all videos in property-media/flats/ in-place using ffmpeg.
 * Downloads each video, re-encodes with H.264 CRF 28, uploads back.
 *
 * Usage: node scripts/compress-videos.mjs
 */

import { execFile } from 'child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';

const execFileAsync = promisify(execFile);

const BASE_URL    = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars before running.');
  process.exit(1);
}
const BUCKET      = 'property-media';
const CONCURRENT  = 2; // lower for video — CPU intensive
const TMP_DIR     = join(tmpdir(), 'denner-video-compress');

const AUTH = { Authorization: `Bearer ${SERVICE_KEY}` };

mkdirSync(TMP_DIR, { recursive: true });

async function listFolder(prefix, limit = 1000) {
  const res = await fetch(`${BASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit }),
  });
  if (!res.ok) throw new Error(`List failed for "${prefix}": ${res.status}`);
  return res.json();
}

async function getAllVideos(prefix = 'flats') {
  const entries = await listFolder(prefix);
  const videos = [];
  for (const entry of entries) {
    const fullPath = `${prefix}/${entry.name}`;
    if (entry.id === null) {
      videos.push(...await getAllVideos(fullPath));
    } else if (entry.metadata?.mimetype?.startsWith('video/')) {
      videos.push({ path: fullPath, size: entry.metadata.size, mime: entry.metadata.mimetype });
    }
  }
  return videos;
}

async function downloadFile(storagePath, destPath) {
  const res = await fetch(`${BASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, { headers: AUTH });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
}

async function uploadFile(storagePath, filePath, mime) {
  const { readFileSync } = await import('fs');
  const buffer = readFileSync(filePath);
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

async function compressVideo(inputPath, outputPath) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-c:v', 'libx264',
    '-crf', '32',          // quality: 0=lossless, 51=worst; 32 = aggressive compression
    '-preset', 'fast',
    '-vf', 'scale=\'min(1280,iw)\':-2',  // max 1280px wide, keep aspect ratio
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ]);
}

async function processVideo(video) {
  const { path, size, mime } = video;
  const id = Date.now() + Math.random().toString(36).slice(2);
  const inputPath  = join(TMP_DIR, `in-${id}.mp4`);
  const outputPath = join(TMP_DIR, `out-${id}.mp4`);

  try {
    await downloadFile(path, inputPath);
    await compressVideo(inputPath, outputPath);

    const { statSync } = await import('fs');
    const compressedSize = statSync(outputPath).size;

    if (compressedSize >= size) {
      return { skipped: true, reason: 'already optimal' };
    }

    await uploadFile(path, outputPath, mime);
    return { originalBytes: size, compressedBytes: compressedSize };
  } finally {
    try { unlinkSync(inputPath); } catch {}
    try { unlinkSync(outputPath); } catch {}
  }
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
  console.log('\nScanning property-media/flats/ for videos...');
  const videos = await getAllVideos('flats');
  console.log(`Found ${videos.length} videos.\n`);

  if (!videos.length) { console.log('No videos found.'); return; }

  let done = 0, skipped = 0, failed = 0;
  let totalOriginal = 0, totalCompressed = 0;
  const failures = [];

  const tasks = videos.map(video => async () => {
    try {
      const result = await processVideo(video);
      if (result.skipped) {
        skipped++;
      } else {
        done++;
        totalOriginal   += result.originalBytes;
        totalCompressed += result.compressedBytes;
      }
    } catch (err) {
      failed++;
      failures.push({ path: video.path, error: err.message });
    }
    process.stdout.write(`\r  ${done}/${videos.length} compressed  ${skipped} skipped  ${failed} failed`);
  });

  await runWithConcurrency(tasks, CONCURRENT);

  const savedMB  = ((totalOriginal - totalCompressed) / 1024 / 1024).toFixed(1);
  const savedPct = totalOriginal ? Math.round((1 - totalCompressed / totalOriginal) * 100) : 0;

  console.log(`\n\nDone.`);
  console.log(`  Compressed : ${done} videos`);
  console.log(`  Skipped    : ${skipped} (already optimal)`);
  console.log(`  Failed     : ${failed}`);
  if (totalOriginal > 0) console.log(`  Space saved: ${savedMB} MB  (${savedPct}% reduction)`);

  if (failures.length) {
    console.log('\nFailed:');
    failures.forEach(({ path, error }) => console.log(`  ${path} — ${error}`));
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });

import sharp from 'sharp';

const BUCKET = process.env.VITE_SUPABASE_STORAGE_BUCKET || 'property-media';
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const MEDIA_ORIGIN_BASE = process.env.MEDIA_ORIGIN_BASE;

// Allowlist of widths to maximize CDN cache hits.
const WIDTH_STEPS = [320, 640, 960, 1280];

sharp.concurrency(1);

function log(fields) {
  console.log(JSON.stringify(fields));
}

function snapWidth(raw) {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  for (const step of WIDTH_STEPS) {
    if (parsed <= step) return step;
  }
  return WIDTH_STEPS[WIDTH_STEPS.length - 1];
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET').end();
  }

  const rawPath = req.query.path;
  if (!rawPath || typeof rawPath !== 'string') {
    return res.status(400).end('Missing path');
  }

  const storagePath = rawPath.replace(/^\/+/, '');
  if (/(^|\/)\.\.(\/|$)/.test(storagePath) || /[\\\x00-\x1f]/.test(storagePath)) {
    return res.status(400).end('Bad path');
  }

  const width = req.query.w ? snapWidth(req.query.w) : null;
  const quality = req.query.q ? Math.min(Math.max(parseInt(req.query.q, 10), 10), 100) : 75;

  try {
    // property-media bucket is public — fetch directly, no signed URL needed.
    // If MEDIA_ORIGIN_BASE is set, fetch from there (R2 cutover via env only);
    // otherwise use the Supabase public storage URL.
    const publicUrl = MEDIA_ORIGIN_BASE
      ? `${MEDIA_ORIGIN_BASE.replace(/\/$/, '')}/${storagePath}`
      : `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
    const upstream = await fetch(publicUrl);
    if (!upstream.ok) {
      log({ event: 'media_miss', path: storagePath, status: upstream.status });
      res.setHeader('Cache-Control', 'public, s-maxage=60');
      return res.status(upstream.status).end('Not found');
    }

    const MAX_UPSTREAM_BYTES = 15 * 1024 * 1024;
    const contentLength = parseInt(upstream.headers.get('content-length') || '', 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_UPSTREAM_BYTES) {
      log({ event: 'media_too_large', path: storagePath, bytes: contentLength });
      return res.status(413).end('Too large');
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const body = Buffer.from(await upstream.arrayBuffer());

    const isResizableImage = contentType.startsWith('image/') &&
      !contentType.includes('svg') &&
      !contentType.includes('gif');

    const CACHE = 'public, s-maxage=604800, max-age=86400, stale-while-revalidate=2592000';

    if (width && isResizableImage) {
      try {
        const resized = await sharp(body, { limitInputPixels: 24000000, failOn: 'truncated' })
          .resize(width, null, { withoutEnlargement: true })
          .webp({ quality })
          .toBuffer();

        log({ event: 'media_serve', path: storagePath, type: 'image/webp', bytes: resized.length, w: width, resized: true });
        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Cache-Control', CACHE);
        res.setHeader('Vary', 'Accept-Encoding');
        return res.status(200).send(resized);
      } catch {
        // Fall through to serve original if Sharp fails
      }
    }

    log({ event: 'media_serve', path: storagePath, type: contentType, bytes: body.length, w: width, resized: false });
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', CACHE);
    res.setHeader('Vary', 'Accept-Encoding');
    return res.status(200).send(body);
  } catch {
    log({ event: 'media_error', path: storagePath, status: 500 });
    return res.status(500).end('Internal error');
  }
}

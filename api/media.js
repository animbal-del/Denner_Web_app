import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const BUCKET = process.env.VITE_SUPABASE_STORAGE_BUCKET || 'property-media';

let _client = null;
function getClient() {
  if (!_client) {
    _client = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY
    );
  }
  return _client;
}

export default async function handler(req, res) {
  const rawPath = req.query.path;
  if (!rawPath || typeof rawPath !== 'string') {
    return res.status(400).end('Missing path');
  }

  const storagePath = rawPath.replace(/^\/+/, '');
  const width = req.query.w ? Math.min(parseInt(req.query.w, 10), 1920) : null;
  const quality = req.query.q ? Math.min(Math.max(parseInt(req.query.q, 10), 10), 100) : 80;

  try {
    const supabase = getClient();

    const { data: urlData, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

    if (signError || !urlData?.signedUrl) {
      return res.status(404).end('Not found');
    }

    const upstream = await fetch(urlData.signedUrl);
    if (!upstream.ok) return res.status(upstream.status).end();

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const body = Buffer.from(await upstream.arrayBuffer());

    const isResizableImage = contentType.startsWith('image/') &&
      !contentType.includes('svg') &&
      !contentType.includes('gif');

    const CACHE = 'public, s-maxage=86400, max-age=3600, stale-while-revalidate=604800';

    if (width && isResizableImage) {
      try {
        const resized = await sharp(body)
          .resize(width, null, { withoutEnlargement: true })
          .webp({ quality })
          .toBuffer();

        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Cache-Control', CACHE);
        res.setHeader('Vary', 'Accept-Encoding');
        return res.status(200).send(resized);
      } catch {
        // Fall through to serve original if Sharp fails
      }
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', CACHE);
    res.setHeader('Vary', 'Accept-Encoding');
    return res.status(200).send(body);
  } catch {
    return res.status(500).end('Internal error');
  }
}

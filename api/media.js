import { createClient } from '@supabase/supabase-js';

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

  try {
    const supabase = getClient();

    // 7-day signed URL so the CDN can safely cache for 24h with room to spare
    const { data: urlData, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

    if (signError || !urlData?.signedUrl) {
      return res.status(404).end('Not found');
    }

    const upstream = await fetch(urlData.signedUrl);
    if (!upstream.ok) return res.status(upstream.status).end();

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const body = await upstream.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    // CDN caches for 24h; browser may reuse for 1h; stale served for 7 days while revalidating
    res.setHeader('Cache-Control', 'public, s-maxage=86400, max-age=3600, stale-while-revalidate=604800');
    res.setHeader('Vary', 'Accept-Encoding');
    return res.status(200).send(Buffer.from(body));
  } catch {
    return res.status(500).end('Internal error');
  }
}

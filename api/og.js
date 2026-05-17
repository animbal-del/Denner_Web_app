import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stableImageUrl(url) {
  if (!url || !url.startsWith('https://')) return null;
  if (/\/object\/sign\//i.test(url)) return null; // signed = expires, reject
  return url;
}

function signedToPublic(url) {
  const match = String(url || '').match(/\/object\/sign\/([^?]+)/);
  if (!match) return null;
  const base = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  return `${base}/storage/v1/object/public/${match[1]}`;
}

function storagePathToPublic(path) {
  if (!path) return null;
  const base = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const bucket = process.env.VITE_SUPABASE_STORAGE_BUCKET || 'property-media';
  return `${base}/storage/v1/object/public/${bucket}/${path.replace(/^\/+/, '')}`;
}

function pickStableImage(coverImageUrl, mediaRow) {
  // Try cover_image_url from the flat record first
  for (const url of [coverImageUrl]) {
    const s = stableImageUrl(url);
    if (s) return s;
    const p = signedToPublic(url);
    if (p) return p;
  }

  // Fall back to inventory_flat_media row fetched in parallel
  if (mediaRow) {
    const s = stableImageUrl(mediaRow.public_url);
    if (s) return s;
    const p = signedToPublic(mediaRow.public_url);
    if (p) return p;
    const c = storagePathToPublic(mediaRow.storage_path);
    if (c) return c;
  }

  return null;
}

export default async function handler(req, res) {
  const { shareCode } = req.query;

  if (!shareCode) {
    res.status(400).send('Missing shareCode');
    return;
  }

  let property = null;
  let coverImageUrl = null;

  try {
    // ── Step 1: resolve flat_id ─────────────────────────────
    // flat-42 format → parse directly (0 DB queries)
    // opaque code    → 1 DB query to property_share_links
    const flatIdMatch = /^flat-(\d+)$/i.exec(shareCode);
    let flatId = flatIdMatch ? Number(flatIdMatch[1]) : null;

    if (!flatId) {
      const { data: link } = await supabase
        .from('property_share_links')
        .select('flat_id')
        .eq('share_code', shareCode)
        .eq('is_active', true)
        .maybeSingle();
      flatId = link?.flat_id || null;
    }

    if (flatId) {
      // ── Step 2: fetch flat data + cover media IN PARALLEL ──
      // Previously 2-3 sequential round trips; now 1 parallel round trip
      const [flatRes, mediaRes] = await Promise.all([
        supabase
          .from('public_listings')
          .select('id, society_name, locality, city, bhk, property_type, furnishing_status, sq_ft, cover_image_url, description')
          .eq('id', flatId)
          .maybeSingle(),
        supabase
          .from('inventory_flat_media')
          .select('public_url, storage_path')
          .eq('flat_id', flatId)
          .order('is_cover', { ascending: false })
          .order('sort_order', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      property = flatRes.data;
      coverImageUrl = pickStableImage(property?.cover_image_url, mediaRes.data);
    }
  } catch {
    // serve generic OG on any error
  }

  const host = req.headers.host || '';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  const siteUrl = process.env.VITE_PUBLIC_SITE_URL || `${proto}://${host}`;
  const propertyUrl = `${siteUrl}/property/${shareCode}`;

  const title = property
    ? `${property.society_name} · ${property.bhk} · ${property.locality}, ${property.city} | Denner`
    : 'Denner — Find your next home';

  const description = property
    ? [
        property.bhk,
        property.property_type,
        property.furnishing_status,
        property.sq_ft ? `${property.sq_ft} sq ft` : null,
        `${property.locality}, ${property.city}`,
      ].filter(Boolean).join(' · ').slice(0, 200)
    : 'Browse verified rental properties on Denner.';

  const image = coverImageUrl || `${siteUrl}/og-default.png`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Denner" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${escapeHtml(propertyUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />
  <script>window.location.replace(${JSON.stringify(propertyUrl)});</script>
</head>
<body>
  <p>Redirecting to <a href="${escapeHtml(propertyUrl)}">${escapeHtml(title)}</a>…</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // 24h CDN cache, serve stale for 7 days while revalidating in background
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  res.status(200).send(html);
}

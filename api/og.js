import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Extract a clean storage path from any cover URL/path (Supabase URL, R2 URL,
// signed URL, or bare path) so the OG image can be served from R2 through the
// /api/media proxy (R2-backed, on the mydenner.com domain).
function normalizePath(value) {
  let s = String(value || '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public|sign|authenticated)\/[^/]+\//i, '');
  s = s.replace(/^https?:\/\/[^/]+\//i, '');
  const q = s.indexOf('?');
  if (q !== -1) s = s.slice(0, q);
  return s.replace(/^public\/property-media\//i, '').replace(/^property-media\//i, '').replace(/^\/+/, '').trim();
}

function pickCoverPath(coverImageUrl, mediaRow) {
  if (mediaRow?.storage_path) return normalizePath(mediaRow.storage_path);
  const fromCover = normalizePath(coverImageUrl);
  if (fromCover) return fromCover;
  if (mediaRow?.public_url) return normalizePath(mediaRow.public_url);
  return '';
}

export default async function handler(req, res) {
  const { shareCode } = req.query;

  if (!shareCode) {
    res.status(400).send('Missing shareCode');
    return;
  }

  if (!/^[A-Za-z0-9_-]{1,64}$/.test(shareCode)) {
    res.status(400).end('Invalid share code');
    return;
  }

  let property = null;
  let coverPath = null;

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
      coverPath = pickCoverPath(property?.cover_image_url, mediaRes.data);
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

  const image = coverPath
    ? `${siteUrl}/api/media?path=${encodeURIComponent(coverPath)}`
    : `${siteUrl}/og-default.png`;

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
  <meta http-equiv="refresh" content="0; url=${escapeHtml(propertyUrl)}" />
</head>
<body>
  <p>Redirecting to <a href="${escapeHtml(propertyUrl)}">${escapeHtml(title)}</a>…</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (property) {
    // 24h CDN cache, serve stale for 7 days while revalidating in background
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  } else {
    // generic/fallback OG (e.g. transient DB error): short cache only
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  }
  res.status(200).send(html);
}

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

/**
 * Signed Supabase storage URLs contain /object/sign/ and expire.
 * Public storage URLs contain /object/public/ and are stable.
 * Return the URL only if it looks stable (public or external CDN).
 */
function stableImageUrl(url) {
  if (!url || !url.startsWith('https://')) return null;
  // Signed storage URL — unreliable for bots
  if (/\/object\/sign\//i.test(url)) return null;
  return url;
}

/**
 * Try to build a public Supabase storage URL from a signed one.
 * e.g. .../object/sign/property-media/flat-1/img.jpg?token=X
 *   → .../object/public/property-media/flat-1/img.jpg
 */
function signedToPublic(url) {
  if (!url) return null;
  const match = url.match(/\/object\/sign\/([^?]+)/);
  if (!match) return null;
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  return `${supabaseUrl}/storage/v1/object/public/${match[1]}`;
}

async function resolveCoverImage(flatId, rawCoverUrl) {
  // 1. Use cover_image_url if it's already a stable URL
  const stable = stableImageUrl(rawCoverUrl);
  if (stable) return stable;

  // 2. Convert signed URL to public format
  const pub = signedToPublic(rawCoverUrl);
  if (pub) return pub;

  // 3. Fall back: query inventory_flat_media for a stored public_url
  try {
    const { data } = await supabase
      .from('inventory_flat_media')
      .select('public_url, storage_path')
      .eq('flat_id', flatId)
      .order('is_cover', { ascending: false })
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (data?.public_url && data.public_url.startsWith('https://')) {
      const s = stableImageUrl(data.public_url);
      if (s) return s;
      const p = signedToPublic(data.public_url);
      if (p) return p;
    }

    // 4. Construct public URL from storage_path
    if (data?.storage_path) {
      const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
      const bucket = process.env.VITE_SUPABASE_STORAGE_BUCKET || 'property-media';
      const path = data.storage_path.replace(/^\/+/, '');
      return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
    }
  } catch {
    // ignore
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
    const flatIdMatch = /^flat-(\d+)$/i.exec(shareCode);
    let flatId = null;

    if (flatIdMatch) {
      flatId = Number(flatIdMatch[1]);
    } else {
      const { data: link } = await supabase
        .from('property_share_links')
        .select('flat_id')
        .eq('share_code', shareCode)
        .eq('is_active', true)
        .maybeSingle();
      flatId = link?.flat_id || null;
    }

    if (flatId) {
      const { data } = await supabase
        .from('public_listings')
        .select('id, society_name, locality, city, bhk, property_type, furnishing_status, sq_ft, cover_image_url, description')
        .eq('id', flatId)
        .maybeSingle();
      property = data;

      if (property) {
        coverImageUrl = await resolveCoverImage(flatId, property.cover_image_url);
      }
    }
  } catch {
    // serve without OG data on error
  }

  const host = req.headers.host || '';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  const siteUrl = process.env.VITE_PUBLIC_SITE_URL || `${proto}://${host}`;
  const propertyUrl = `${siteUrl}/property/${shareCode}`;

  // Title: name · BHK · locality — no rent (intentional, increases tap-through)
  const title = property
    ? `${property.society_name} · ${property.bhk} · ${property.locality}, ${property.city} | Denner`
    : 'Denner — Find your next home';

  // Description: key attributes, no rent
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
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  res.status(200).send(html);
}

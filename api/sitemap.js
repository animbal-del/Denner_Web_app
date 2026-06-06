import { createClient } from '@supabase/supabase-js';

// XML sitemap for mydenner.com. Emits static routes, Pune area landing pages,
// and (best-effort) live property pages resolved from property_share_links.
// Cached for 24h on the CDN.

const SITE_URL = 'https://mydenner.com';
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');

let _supabase = null;
function db() {
  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return _supabase;
}

// Static routes with sensible crawl hints.
const STATIC_ROUTES = [
  { path: '/',            changefreq: 'daily',   priority: '1.0' },
  { path: '/properties',  changefreq: 'hourly',  priority: '0.9' },
  { path: '/urgent-help', changefreq: 'monthly', priority: '0.6' },
  { path: '/privacy',     changefreq: 'yearly',  priority: '0.3' },
  { path: '/faq',         changefreq: 'monthly', priority: '0.5' },
  { path: '/guide',       changefreq: 'monthly', priority: '0.5' },
];

// Pune area landing pages → /flats-in-<slug>.
const AREA_SLUGS = [
  'pune', 'kharadi', 'viman-nagar', 'wakad', 'baner', 'hinjewadi',
  'hadapsar', 'kothrud', 'magarpatta', 'balewadi', 'aundh', 'wagholi',
  'kalyani-nagar', 'koregaon-park',
];

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry({ loc, lastmod, changefreq, priority }) {
  const parts = [`  <url>`, `    <loc>${escapeXml(loc)}</loc>`];
  if (lastmod) parts.push(`    <lastmod>${escapeXml(lastmod)}</lastmod>`);
  if (changefreq) parts.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) parts.push(`    <priority>${priority}</priority>`);
  parts.push(`  </url>`);
  return parts.join('\n');
}

// Resolve live property share codes joined to live public_listings. Best-effort:
// any failure returns [] so the static + area sitemap still serves.
async function fetchPropertyUrls() {
  try {
    const { data, error } = await db()
      .from('property_share_links')
      .select('share_code, updated_at, public_listings!inner(id, updated_at)')
      .eq('is_active', true)
      .limit(5000);
    if (error) throw error;

    const out = [];
    for (const row of data || []) {
      if (!row.share_code) continue;
      const listing = Array.isArray(row.public_listings)
        ? row.public_listings[0]
        : row.public_listings;
      if (!listing) continue;
      const lastmodRaw = listing.updated_at || row.updated_at || null;
      const lastmod = lastmodRaw ? new Date(lastmodRaw).toISOString().slice(0, 10) : null;
      out.push({
        loc: `${SITE_URL}/property/${row.share_code}`,
        lastmod,
        changefreq: 'weekly',
        priority: '0.8',
      });
    }
    return out;
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).setHeader('Allow', 'GET').end();

  const today = new Date().toISOString().slice(0, 10);

  const entries = [];

  for (const r of STATIC_ROUTES) {
    entries.push(urlEntry({
      loc: `${SITE_URL}${r.path}`,
      lastmod: today,
      changefreq: r.changefreq,
      priority: r.priority,
    }));
  }

  for (const slug of AREA_SLUGS) {
    entries.push(urlEntry({
      loc: `${SITE_URL}/flats-in-${slug}`,
      lastmod: today,
      changefreq: 'daily',
      priority: '0.7',
    }));
  }

  const propertyUrls = await fetchPropertyUrls();
  for (const p of propertyUrls) entries.push(urlEntry(p));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).send(xml);
}

import { createClient } from '@supabase/supabase-js';

export const PUBLIC_PAGE_SIZE = 12;

const BUCKET = process.env.VITE_SUPABASE_STORAGE_BUCKET || 'property-media';
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const MEDIA_ORIGIN_BASE = (process.env.MEDIA_ORIGIN_BASE || '').replace(/\/$/, '');

let _supabase = null;
function db() {
  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return _supabase;
}

const PUBLIC_SELECT = `
  id, society_name, city, locality, sub_locality, bhk, property_type,
  monthly_rent, deposit, maintenance, furnishing_status, sq_ft,
  bathrooms, balconies, available_from, listing_status, business_status,
  visibility_status, description, cover_image_url,
  handler_whatsapp_number, handler_name, updated_at
`;

// Narrow projection for list/grid cards — only columns the grid renders,
// plus updated_at (used for sort/keyset).
const LIST_SELECT = `
  id, society_name, city, locality, sub_locality, bhk, property_type,
  monthly_rent, furnishing_status, cover_image_url, updated_at
`;

// ── Pure helpers ─────────────────────────────────────────────

function normalizeStoragePath(path = '') {
  let s = String(path || '').trim();
  if (!s) return '';
  // strip a full Supabase storage URL prefix (domain + object path)
  s = s.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public|sign|authenticated)\/[^/]+\//i, '');
  // strip any remaining bare domain (R2 r2.dev / custom media domain)
  s = s.replace(/^https?:\/\/[^/]+\//i, '');
  const qIdx = s.indexOf('?');
  if (qIdx !== -1) s = s.slice(0, qIdx);
  return s.replace(/^public\/property-media\//i, '').replace(/^property-media\//i, '').replace(/^\/+/, '').trim();
}

// Route a cover image (URL or path, Supabase or R2) through the /api/media
// proxy so it is served from R2 (with Supabase fallback) like all other images.
function coverProxyUrl(coverImageUrl) {
  const p = normalizeStoragePath(coverImageUrl);
  if (p) return `/api/media?path=${encodeURIComponent(p)}`;
  return looksLikeHttpUrl(coverImageUrl) ? coverImageUrl : null;
}

function looksLikeHttpUrl(value = '') {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function mediaTypeRank(type) {
  const v = String(type || '').toLowerCase();
  if (['image', 'photo', 'img'].includes(v)) return 3;
  if (['video', 'vid'].includes(v)) return 2;
  return 1;
}

function chooseCoverCandidate(rows = []) {
  return rows.slice().sort((a, b) => {
    const sa = [(a.is_cover ? 1 : 0), mediaTypeRank(a.media_type), -(a.sort_order || 0)];
    const sb = [(b.is_cover ? 1 : 0), mediaTypeRank(b.media_type), -(b.sort_order || 0)];
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sb[i] - sa[i];
    return 0;
  })[0] || null;
}

function sortMedia(items = []) {
  return [...items].sort((a, b) => {
    if ((a.is_cover ? 1 : 0) !== (b.is_cover ? 1 : 0)) return (b.is_cover ? 1 : 0) - (a.is_cover ? 1 : 0);
    if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
}

// Build CDN-friendly URLs — no signed tokens needed on the server side.
// Images go through the /api/media proxy (Vercel CDN, Sharp resize).
// Videos are served directly from R2 (when MEDIA_ORIGIN_BASE is set) with a
// Supabase fallback URL the client tries on error; else from Supabase.
function buildMediaUrls(mediaRow) {
  const normalized = normalizeStoragePath(mediaRow.storage_path || mediaRow.public_url);
  const isVideo = String(mediaRow.media_type || '').toLowerCase() === 'video';

  if (!normalized) {
    const fallback = looksLikeHttpUrl(mediaRow.public_url) ? mediaRow.public_url : '';
    return { url: fallback, fallback_urls: [] };
  }

  const supaUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${normalized}`;

  if (isVideo) {
    const primary = MEDIA_ORIGIN_BASE ? `${MEDIA_ORIGIN_BASE}/${normalized}` : supaUrl;
    return {
      url: primary,
      fallback_urls: primary !== supaUrl ? [supaUrl] : [],
    };
  }

  return {
    url: `/api/media?path=${encodeURIComponent(normalized)}`,
    fallback_urls: [`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${normalized}`],
  };
}

function normalizeProperty(row, mediaMap, shareCodeMap) {
  const media = mediaMap.get(row.id) || [];
  const coverPath = normalizeStoragePath(row.cover_image_url);
  const coverProxy = coverProxyUrl(row.cover_image_url);
  const rawCover = looksLikeHttpUrl(row.cover_image_url) ? row.cover_image_url : null;
  const fallbackCover = coverProxy
    ? [{ id: `cover-${row.id}`, flat_id: row.id, media_type: 'image', url: coverProxy, fallback_urls: rawCover ? [rawCover] : [], storage_path: coverPath || null, is_cover: true, sort_order: 0 }]
    : [];

  const shareCode = shareCodeMap.get(row.id) || row.share_code || null;

  return {
    id: row.id,
    share_code: shareCode || `flat-${row.id}`,
    society_name: row.society_name,
    city: row.city,
    locality: row.locality,
    sub_locality: row.sub_locality || null,
    bhk: row.bhk,
    property_type: row.property_type || 'Flat',
    monthly_rent: row.monthly_rent,
    deposit: row.deposit || 0,
    maintenance: row.maintenance || 0,
    furnishing_status: row.furnishing_status || 'Not specified',
    sq_ft: row.sq_ft,
    bathrooms: row.bathrooms,
    balconies: row.balconies,
    available_from: row.available_from,
    listing_status: row.listing_status,
    business_status: row.business_status,
    visibility_status: row.visibility_status,
    description: row.description || '',
    handler_whatsapp_number: row.handler_whatsapp_number || null,
    handler_name: row.handler_name || null,
    highlights: [row.furnishing_status, row.property_type].filter(Boolean).slice(0, 2),
    cover_image_url: coverProxy,
    media: media.length ? media : fallbackCover,
  };
}

// ── DB fetchers ──────────────────────────────────────────────

async function fetchShareCodeMap(flatIds) {
  if (!flatIds.length) return new Map();
  const { data, error } = await db()
    .from('property_share_links')
    .select('flat_id, share_code, created_at')
    .in('flat_id', flatIds)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const map = new Map();
  for (const row of data || []) {
    if (!map.has(row.flat_id) && row.share_code) map.set(row.flat_id, row.share_code);
  }
  return map;
}

// Build the cover-map entry for a chosen media row (shape preserved for callers).
function buildCoverEntry(chosen, coverImageUrlMap) {
  const { url, fallback_urls } = buildMediaUrls(chosen);
  const coverUrl = coverImageUrlMap.get(chosen.flat_id) || '';
  const allFallbacks = looksLikeHttpUrl(coverUrl) ? [...fallback_urls, coverUrl] : fallback_urls;
  return [{
    id: chosen.id, flat_id: chosen.flat_id, media_type: chosen.media_type,
    url: url || (looksLikeHttpUrl(coverUrl) ? coverUrl : ''),
    fallback_urls: allFallbacks,
    storage_path: normalizeStoragePath(chosen.storage_path || chosen.public_url),
    is_cover: chosen.is_cover, sort_order: chosen.sort_order || 0, created_at: chosen.created_at,
  }];
}

// Bounded cover fetch: most flats contribute 1 row instead of all their media.
// (1) Fetch flagged cover rows for the page; (2) for flats with no cover row,
// one fallback query ordered by sort_order, created_at and take the first per flat.
// Cover columns only — drops nothing the cover chooser/URL builder needs.
const COVER_MEDIA_COLS = 'id, flat_id, media_type, public_url, storage_path, is_cover, sort_order, created_at';

async function fetchCoverMediaMap(flatIds, coverImageUrlMap = new Map()) {
  if (!flatIds.length) return new Map();

  const out = new Map();

  // (1) Flagged cover rows. A flat may in theory have more than one is_cover row;
  // chooseCoverCandidate preserves the original tie-break (image > video, then sort_order).
  const { data: coverRows, error: coverErr } = await db()
    .from('inventory_flat_media')
    .select(COVER_MEDIA_COLS)
    .in('flat_id', flatIds)
    .eq('is_cover', true);
  if (coverErr) throw coverErr;

  const coverGrouped = new Map();
  for (const row of coverRows || []) {
    if (!coverGrouped.has(row.flat_id)) coverGrouped.set(row.flat_id, []);
    coverGrouped.get(row.flat_id).push(row);
  }
  for (const [flatId, rows] of coverGrouped) {
    const chosen = chooseCoverCandidate(rows);
    if (chosen) out.set(flatId, buildCoverEntry(chosen, coverImageUrlMap));
  }

  // (2) Fallback for flats with no flagged cover: first media by sort order.
  const missingIds = flatIds.filter((id) => !out.has(id));
  if (missingIds.length) {
    const { data: fallbackRows, error: fallbackErr } = await db()
      .from('inventory_flat_media')
      .select(COVER_MEDIA_COLS)
      .in('flat_id', missingIds)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (fallbackErr) throw fallbackErr;

    // Rows arrive ordered by (sort_order, created_at); first seen per flat wins.
    for (const row of fallbackRows || []) {
      if (!out.has(row.flat_id)) out.set(row.flat_id, buildCoverEntry(row, coverImageUrlMap));
    }
  }

  // (3) Cover-image-url-only fallback for flats with no media rows at all.
  for (const flatId of flatIds) {
    if (!out.has(flatId)) {
      const coverUrl = coverImageUrlMap.get(flatId) || '';
      if (looksLikeHttpUrl(coverUrl)) {
        out.set(flatId, [{ id: `cover-${flatId}`, flat_id: flatId, media_type: 'image', url: coverUrl, fallback_urls: [], storage_path: null, is_cover: true, sort_order: 0, created_at: null }]);
      }
    }
  }

  return out;
}

async function fetchAllMediaForFlat(flatId) {
  if (!flatId) return [];
  const { data, error } = await db()
    .from('inventory_flat_media')
    .select('id, flat_id, media_type, public_url, storage_path, is_cover, sort_order, created_at')
    .eq('flat_id', flatId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;

  return sortMedia(
    (data || []).map((row) => {
      const { url, fallback_urls } = buildMediaUrls(row);
      return {
        id: row.id, flat_id: row.flat_id, media_type: row.media_type,
        url, fallback_urls,
        storage_path: normalizeStoragePath(row.storage_path || row.public_url),
        is_cover: row.is_cover, sort_order: row.sort_order || 0, created_at: row.created_at,
      };
    }).filter((item) => item.url)
  );
}

// ── Exported query functions ─────────────────────────────────

export async function fetchFilterOptions() {
  const { data, error } = await db().rpc('get_filter_options');
  if (error) throw error;
  const r = data || {};
  return {
    cities: r.cities || [],
    localities: r.localities || [],
    propertyTypes: r.propertyTypes || [],
    furnishingStatuses: r.furnishingStatuses || [],
    rentBounds: { min: r.minRent || 0, max: r.maxRent || 0 },
  };
}

// Locality-specific rent bounds via two aggregation queries, reusing the
// memoized client. Caps at 5 localities (preserves rent-bounds.js behavior).
export async function fetchRentBoundsForLocalities(localities = []) {
  const safe = localities.slice(0, 5);
  if (!safe.length) return { min: 0, max: 0 };

  const [{ data: minData, error: minErr }, { data: maxData, error: maxErr }] = await Promise.all([
    db().from('public_listings').select('monthly_rent')
      .in('locality', safe).not('monthly_rent', 'is', null)
      .order('monthly_rent', { ascending: true }).limit(1),
    db().from('public_listings').select('monthly_rent')
      .in('locality', safe).not('monthly_rent', 'is', null)
      .order('monthly_rent', { ascending: false }).limit(1),
  ]);

  if (minErr) throw minErr;
  if (maxErr) throw maxErr;

  return {
    min: Number(minData?.[0]?.monthly_rent || 0),
    max: Number(maxData?.[0]?.monthly_rent || 0),
  };
}

export async function fetchProperties(filters = {}, page = 1, pageSize = PUBLIC_PAGE_SIZE) {
  const {
    localities = [], city = '', propertyType = '', furnishingStatus = '',
    bhk = '', sortBy = 'newest', search = '',
  } = filters;

  const start = Math.max(0, (page - 1) * pageSize);
  const end = start + pageSize;

  let q = db().from('public_listings').select(LIST_SELECT);

  const cappedLocalities = localities.length > 10 ? localities.slice(0, 10) : localities;
  if (cappedLocalities.length > 0) q = q.in('locality', cappedLocalities);
  if (city)             q = q.eq('city', city);
  if (propertyType)     q = q.eq('property_type', propertyType);
  if (furnishingStatus) q = q.eq('furnishing_status', furnishingStatus);
  if (bhk && bhk !== '4+') q = q.ilike('bhk', `${bhk}%`);
  if (search) {
    const safe = search.replace(/%/g, '\\%').replace(/_/g, '\\_');
    q = q.or(`society_name.ilike.%${safe}%,locality.ilike.%${safe}%,sub_locality.ilike.%${safe}%,city.ilike.%${safe}%`);
  }

  if (sortBy === 'rent-low')       q = q.order('monthly_rent', { ascending: true }).order('id', { ascending: true });
  else if (sortBy === 'rent-high') q = q.order('monthly_rent', { ascending: false }).order('id', { ascending: false });
  else                             q = q.order('updated_at', { ascending: false });

  const { data, error } = await q.range(start, end);
  if (error) throw error;

  const rows = data || [];
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const flatIds = pageRows.map((r) => r.id);

  const coverImageUrlMap = new Map(
    pageRows.filter((r) => looksLikeHttpUrl(r.cover_image_url)).map((r) => [r.id, r.cover_image_url])
  );

  const [coverMediaMap, shareCodeMap] = await Promise.all([
    fetchCoverMediaMap(flatIds, coverImageUrlMap),
    fetchShareCodeMap(flatIds),
  ]);

  return { items: pageRows.map((r) => normalizeProperty(r, coverMediaMap, shareCodeMap)), hasMore, page, pageSize };
}

export async function fetchPropertiesByIds(ids = []) {
  const uniqueIds = [...new Set(ids.map(Number).filter(Boolean))].slice(0, 50);
  if (!uniqueIds.length) return [];

  const { data, error } = await db()
    .from('public_listings')
    .select(LIST_SELECT)
    .in('id', uniqueIds);
  if (error) throw error;

  const rowMap = new Map((data || []).map((r) => [r.id, r]));
  const ordered = uniqueIds.map((id) => rowMap.get(id)).filter(Boolean);
  const orderedIds = ordered.map((r) => r.id);

  const coverImageUrlMap = new Map(
    ordered.filter((r) => looksLikeHttpUrl(r.cover_image_url)).map((r) => [r.id, r.cover_image_url])
  );

  const [coverMediaMap, shareCodeMap] = await Promise.all([
    fetchCoverMediaMap(orderedIds, coverImageUrlMap),
    fetchShareCodeMap(orderedIds),
  ]);

  return ordered.map((r) => normalizeProperty(r, coverMediaMap, shareCodeMap));
}

export async function fetchPropertyByRef(propertyRef) {
  let row = null;
  let shareCode = null;
  const flatIdMatch = /^flat-(\d+)$/i.exec(propertyRef);

  if (flatIdMatch) {
    const { data, error } = await db()
      .from('public_listings')
      .select(PUBLIC_SELECT)
      .eq('id', Number(flatIdMatch[1]))
      .maybeSingle();
    if (error) throw error;
    row = data;
  } else {
    const { data: linkRow, error: linkError } = await db()
      .from('property_share_links')
      .select('flat_id, share_code')
      .eq('share_code', propertyRef)
      .eq('is_active', true)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!linkRow?.flat_id) return null;
    shareCode = linkRow.share_code;

    const { data, error } = await db()
      .from('public_listings')
      .select(PUBLIC_SELECT)
      .eq('id', linkRow.flat_id)
      .maybeSingle();
    if (error) throw error;
    row = data;
  }

  if (!row) return null;
  const media = await fetchAllMediaForFlat(row.id);
  const shareCodeMap = shareCode ? new Map([[row.id, shareCode]]) : new Map();
  return normalizeProperty(row, new Map([[row.id, media]]), shareCodeMap);
}

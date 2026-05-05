import { hasSupabase, supabase } from '../lib/supabaseClient.js';
import { hasStorageClient, storageClient } from '../lib/storageClient.js';

const MEDIA_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || 'property-media';
const PUBLIC_PAGE_SIZE = 12;

/* ── Helpers ───────────────────────────────────────────────── */

function sortMedia(items = []) {
  return [...items].sort((a, b) => {
    if ((a.is_cover ? 1 : 0) !== (b.is_cover ? 1 : 0)) return (b.is_cover ? 1 : 0) - (a.is_cover ? 1 : 0);
    if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
}

function makePropertyRef(row) {
  return row.share_code || `flat-${row.id}`;
}

/**
 * Extract the bare storage object key from any URL or path format.
 * Must return the path AFTER the bucket name, with no query string.
 *
 * Handles:
 *   https://.../object/public/property-media/flat-1/a.jpg   → flat-1/a.jpg
 *   https://.../object/sign/property-media/flat-1/a.jpg?token=X → flat-1/a.jpg
 *   https://.../object/authenticated/property-media/flat-1/a.jpg → flat-1/a.jpg
 *   property-media/flat-1/a.jpg → flat-1/a.jpg
 *   flat-1/a.jpg → flat-1/a.jpg
 */
function normalizeStoragePath(path = '') {
  let s = String(path || '').trim();
  if (!s) return '';

  // Strip full Supabase storage URLs (public, sign, authenticated)
  s = s.replace(
    /^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public|sign|authenticated)\/[^/]+\//i,
    ''
  );

  // Strip any query string (signed URL token, cache-busters etc.)
  const qIdx = s.indexOf('?');
  if (qIdx !== -1) s = s.slice(0, qIdx);

  // Strip bucket-name prefix if still present
  s = s
    .replace(/^public\/property-media\//i, '')
    .replace(/^property-media\//i, '')
    .replace(/^\/+/, '')
    .trim();

  return s;
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

function getPublicMediaUrl(storagePath) {
  const normalized = normalizeStoragePath(storagePath);
  if (!normalized) return '';
  const client = storageClient || supabase;
  if (!client) return '';
  const { data } = client.storage.from(MEDIA_BUCKET).getPublicUrl(normalized);
  return data?.publicUrl || '';
}

/* ── Signed URL generation ─────────────────────────────────── */

/**
 * Create signed URLs for a list of media rows.
 *
 * Uses storageClient (service role / media key) when available — this
 * bypasses bucket RLS so ALL properties get signed URLs regardless of
 * whether the bucket is public or private.
 *
 * Falls back to the anon client (works only if bucket policy allows anon reads).
 * Returns empty map on any failure.
 */
async function createSignedMediaUrlMap(rows = []) {
  const client = hasStorageClient ? storageClient : supabase;
  if (!client) return new Map();

  // Collect unique, non-empty normalized paths
  const paths = [
    ...new Set(
      (rows || [])
        .map((r) => normalizeStoragePath(r?.storage_path || r?.public_url || ''))
        .filter(Boolean)
    ),
  ];
  if (!paths.length) return new Map();

  // Supabase caps createSignedUrls at 10 paths per call — batch if needed
  const BATCH = 10;
  const out = new Map();

  for (let i = 0; i < paths.length; i += BATCH) {
    const chunk = paths.slice(i, i + BATCH);
    try {
      const { data, error } = await client.storage
        .from(MEDIA_BUCKET)
        .createSignedUrls(chunk, 60 * 60); // 1-hour tokens

      if (!error && Array.isArray(data)) {
        data.forEach((entry, idx) => {
          if (entry?.signedUrl) out.set(chunk[idx], entry.signedUrl);
        });
      }
    } catch {
      // Ignore — other fallbacks will handle it
    }
  }

  return out;
}

/* ── Candidate URL builder ─────────────────────────────────── */

/**
 * Return an ordered list of URLs to try for a media row.
 * MediaAsset.jsx cycles through these via onError until one loads.
 *
 * Priority:
 *  1. Signed URL — token-based, works for private buckets, no auth needed by viewer
 *  2. Stored public_url — direct CDN or public storage URL from DB
 *  3. Generated public storage URL — works if bucket is public
 *  4. Extra fallbacks (e.g. cover_image_url from the flat row)
 */
function buildMediaCandidates(mediaRow, signedUrlMap = new Map(), extraFallbacks = []) {
  const normalized = normalizeStoragePath(mediaRow?.storage_path || mediaRow?.public_url || '');
  const candidates = [];

  // 1. Signed URL
  if (normalized && signedUrlMap.has(normalized)) {
    candidates.push(signedUrlMap.get(normalized));
  }

  // 2. Stored public_url (direct accessible URL)
  if (looksLikeHttpUrl(mediaRow?.public_url)) {
    candidates.push(mediaRow.public_url);
  }

  // 3. Supabase public storage URL
  if (normalized) {
    candidates.push(getPublicMediaUrl(normalized));
  }

  // 4. Extra fallbacks
  for (const url of extraFallbacks) {
    if (looksLikeHttpUrl(url)) candidates.push(url);
  }

  return [...new Set(candidates.filter(Boolean))];
}

/* ── Database fetchers ─────────────────────────────────────── */

async function fetchShareCodeMap(flatIds) {
  if (!flatIds.length) return new Map();
  const { data, error } = await supabase
    .from('property_share_links')
    .select('flat_id, share_code, is_active, created_at')
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

async function fetchCoverMediaMap(flatIds, coverImageUrlMap = new Map()) {
  if (!flatIds.length) return new Map();

  const { data, error } = await supabase
    .from('inventory_flat_media')
    .select('id, flat_id, media_type, public_url, storage_path, is_cover, sort_order, created_at')
    .in('flat_id', flatIds)
    .order('is_cover', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;

  // Group rows by flat
  const grouped = new Map();
  for (const row of data || []) {
    if (!grouped.has(row.flat_id)) grouped.set(row.flat_id, []);
    grouped.get(row.flat_id).push(row);
  }

  // Pick the best cover row per flat
  const chosenRows = [];
  for (const flatId of flatIds) {
    const chosen = chooseCoverCandidate(grouped.get(flatId) || []);
    if (chosen) chosenRows.push(chosen);
  }

  // Generate signed URLs for all chosen rows in one (batched) call
  const signedUrlMap = await createSignedMediaUrlMap(chosenRows);

  const out = new Map();

  for (const row of chosenRows) {
    const normalized = normalizeStoragePath(row.storage_path || row.public_url);
    const coverUrl = coverImageUrlMap.get(row.flat_id) || '';
    const candidates = buildMediaCandidates(row, signedUrlMap, [coverUrl]);

    // Even if candidates is empty, include a placeholder so the flat appears
    out.set(row.flat_id, [{
      id: row.id,
      flat_id: row.flat_id,
      media_type: row.media_type,
      url: candidates[0] || '',
      fallback_urls: candidates.slice(1),
      storage_path: normalized,
      is_cover: row.is_cover,
      sort_order: row.sort_order || 0,
      created_at: row.created_at,
    }]);
  }

  // Flats with NO media rows at all → use cover_image_url directly
  for (const flatId of flatIds) {
    if (!out.has(flatId)) {
      const coverUrl = coverImageUrlMap.get(flatId) || '';
      if (looksLikeHttpUrl(coverUrl)) {
        out.set(flatId, [{
          id: `cover-${flatId}`,
          flat_id: flatId,
          media_type: 'image',
          url: coverUrl,
          fallback_urls: [],
          storage_path: null,
          is_cover: true,
          sort_order: 0,
          created_at: null,
        }]);
      }
    }
  }

  return out;
}

async function fetchAllMediaForFlat(flatId) {
  if (!flatId) return [];

  const { data, error } = await supabase
    .from('inventory_flat_media')
    .select('id, flat_id, media_type, public_url, storage_path, is_cover, sort_order, created_at')
    .eq('flat_id', flatId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;

  const rows = data || [];
  const signedUrlMap = await createSignedMediaUrlMap(rows);

  return sortMedia(
    rows
      .map((row) => ({
        id: row.id,
        flat_id: row.flat_id,
        media_type: row.media_type,
        url: buildMediaCandidates(row, signedUrlMap)[0] || '',
        fallback_urls: buildMediaCandidates(row, signedUrlMap).slice(1),
        storage_path: normalizeStoragePath(row.storage_path || row.public_url),
        is_cover: row.is_cover,
        sort_order: row.sort_order || 0,
        created_at: row.created_at,
      }))
      .filter((item) => item.url)
  );
}

/* ── Property normaliser ───────────────────────────────────── */

function normalizeProperty(row, mediaMap, shareCodeMap) {
  const media = mediaMap.get(row.id) || [];

  const fallbackCover =
    row.cover_image_url && looksLikeHttpUrl(row.cover_image_url)
      ? [{
          id: `cover-${row.id}`,
          flat_id: row.id,
          media_type: 'image',
          url: row.cover_image_url,
          fallback_urls: [],
          storage_path: null,
          is_cover: true,
          sort_order: 0,
        }]
      : [];

  return {
    id: row.id,
    share_code: makePropertyRef({ ...row, share_code: shareCodeMap.get(row.id) || row.share_code || null }),
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
    media: media.length ? media : fallbackCover,
  };
}

/* ── Public query selects ──────────────────────────────────── */

const PUBLIC_SELECT = `
  id, society_name, city, locality, sub_locality, bhk, property_type,
  monthly_rent, deposit, maintenance, furnishing_status, sq_ft,
  bathrooms, balconies, available_from, listing_status, business_status,
  visibility_status, description, cover_image_url,
  handler_whatsapp_number, handler_name, updated_at
`;

/* ── Page & detail fetchers ────────────────────────────────── */

async function fetchSupabasePropertiesPage(page = 1, pageSize = PUBLIC_PAGE_SIZE) {
  const start = Math.max(0, (page - 1) * pageSize);
  const end = start + pageSize;

  const { data, error } = await supabase
    .from('inventory_flats')
    .select(PUBLIC_SELECT)
    .eq('listing_status', 'live')
    .eq('business_status', 'available')
    .order('updated_at', { ascending: false })
    .range(start, end);
  if (error) throw error;

  const rows = data || [];
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const flatIds = pageRows.map((r) => r.id);

  const coverImageUrlMap = new Map(
    pageRows
      .filter((r) => looksLikeHttpUrl(r.cover_image_url))
      .map((r) => [r.id, r.cover_image_url])
  );

  const [coverMediaMap, shareCodeMap] = await Promise.all([
    fetchCoverMediaMap(flatIds, coverImageUrlMap),
    fetchShareCodeMap(flatIds),
  ]);

  return {
    items: pageRows.map((r) => normalizeProperty(r, coverMediaMap, shareCodeMap)),
    hasMore,
    page,
    pageSize,
  };
}

async function fetchSupabasePropertyByRef(propertyRef) {
  let row = null;
  let shareCode = null;
  const flatIdMatch = /^flat-(\d+)$/i.exec(propertyRef);

  if (flatIdMatch) {
    const flatId = Number(flatIdMatch[1]);
    const { data, error } = await supabase
      .from('inventory_flats')
      .select(PUBLIC_SELECT)
      .eq('id', flatId)
      .eq('listing_status', 'live')
      .eq('business_status', 'available')
      .maybeSingle();
    if (error) throw error;
    row = data;
  } else {
    const { data: linkRow, error: linkError } = await supabase
      .from('property_share_links')
      .select('flat_id, share_code, is_active')
      .eq('share_code', propertyRef)
      .eq('is_active', true)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!linkRow?.flat_id) return null;
    shareCode = linkRow.share_code;

    const { data, error } = await supabase
      .from('inventory_flats')
      .select(PUBLIC_SELECT)
      .eq('id', linkRow.flat_id)
      .eq('listing_status', 'live')
      .eq('business_status', 'available')
      .maybeSingle();
    if (error) throw error;
    row = data;
  }

  if (!row) return null;

  const media = await fetchAllMediaForFlat(row.id);
  const shareCodeMap = new Map();
  if (shareCode) shareCodeMap.set(row.id, shareCode);
  return normalizeProperty(row, new Map([[row.id, media]]), shareCodeMap);
}

/* ── Exports ───────────────────────────────────────────────── */

export async function getPreviewPropertiesPage(page = 1, pageSize = PUBLIC_PAGE_SIZE) {
  if (!hasSupabase) throw new Error('Supabase is not configured.');
  return fetchSupabasePropertiesPage(page, pageSize);
}

export async function fetchPreviewPropertiesByIds(flatIds = []) {
  if (!hasSupabase) throw new Error('Supabase is not configured.');
  const ids = [...new Set((flatIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('inventory_flats')
    .select(PUBLIC_SELECT)
    .in('id', ids)
    .eq('listing_status', 'live')
    .eq('business_status', 'available');
  if (error) throw error;

  const rows = data || [];
  const rowMap = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => rowMap.get(id)).filter(Boolean);
  const orderedIds = ordered.map((r) => r.id);

  const coverImageUrlMap = new Map(
    ordered
      .filter((r) => looksLikeHttpUrl(r.cover_image_url))
      .map((r) => [r.id, r.cover_image_url])
  );

  const [coverMediaMap, shareCodeMap] = await Promise.all([
    fetchCoverMediaMap(orderedIds, coverImageUrlMap),
    fetchShareCodeMap(orderedIds),
  ]);

  return ordered.map((r) => normalizeProperty(r, coverMediaMap, shareCodeMap));
}

export async function getPreviewPropertyByShareCode(propertyRef) {
  if (!hasSupabase) throw new Error('Supabase is not configured.');
  return fetchSupabasePropertyByRef(propertyRef);
}

export function getCoverImage(property) {
  return property?.media?.[0]?.url || '';
}

export async function getFilterOptions() {
  if (!hasSupabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from('inventory_flats')
    .select('city, locality, property_type, furnishing_status')
    .eq('listing_status', 'live')
    .eq('business_status', 'available')
    .limit(2000);
  if (error) throw error;

  const rows = data || [];
  const unique = (key) =>
    [...new Set(rows.map((r) => String(r[key] || '').trim()).filter(Boolean))].sort();

  return {
    cities: unique('city'),
    localities: unique('locality'),
    propertyTypes: unique('property_type'),
    furnishingStatuses: unique('furnishing_status'),
  };
}

export async function getAvailableLocalities() {
  if (!hasSupabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from('inventory_flats')
    .select('locality')
    .eq('listing_status', 'live')
    .eq('business_status', 'available')
    .not('locality', 'is', null)
    .order('locality', { ascending: true })
    .limit(1000);
  if (error) throw error;
  return [...new Set((data || []).map((r) => String(r.locality || '').trim()).filter(Boolean))];
}

export async function getRentBoundsForLocalities(localities = []) {
  if (!hasSupabase) throw new Error('Supabase is not configured.');
  const selected = [
    ...new Set((localities || []).map((l) => String(l || '').trim()).filter(Boolean)),
  ].slice(0, 3);

  let query = supabase
    .from('inventory_flats')
    .select('monthly_rent')
    .eq('listing_status', 'live')
    .eq('business_status', 'available')
    .not('monthly_rent', 'is', null)
    .order('monthly_rent', { ascending: true })
    .limit(1000);

  if (selected.length) query = query.in('locality', selected);

  const { data, error } = await query;
  if (error) throw error;

  const rents = (data || [])
    .map((r) => Number(r.monthly_rent))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  if (!rents.length) return { min: 0, max: 0 };
  return { min: rents[0], max: rents[rents.length - 1] };
}

export { PUBLIC_PAGE_SIZE };

import { hasSupabase, supabase } from '../lib/supabaseClient.js';

const MEDIA_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || 'property-media';
const PUBLIC_PAGE_SIZE = 12;

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

function normalizeStoragePath(path = '') {
  return String(path || '')
    .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public|sign)\/property-media\//i, '')
    .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/sign\/property-media\/[^?]*\?token=.*$/i, '')
    .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\/property-media\//i, '')
    .replace(/^public\/property-media\//i, '')
    .replace(/^property-media\//i, '')
    .replace(/^\/+/, '')
    .trim();
}

function looksLikeHttpUrl(value = '') {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function mediaTypeRank(type) {
  const value = String(type || '').toLowerCase();
  if (['image', 'photo', 'img'].includes(value)) return 3;
  if (['video', 'vid'].includes(value)) return 2;
  return 1;
}

function chooseCoverCandidate(rows = []) {
  return rows
    .slice()
    .sort((a, b) => {
      const scoreA = [(a.is_cover ? 1 : 0), mediaTypeRank(a.media_type), -(a.sort_order || 0)];
      const scoreB = [(b.is_cover ? 1 : 0), mediaTypeRank(b.media_type), -(b.sort_order || 0)];
      for (let i = 0; i < scoreA.length; i += 1) {
        if (scoreA[i] !== scoreB[i]) return scoreB[i] - scoreA[i];
      }
      return 0;
    })[0] || null;
}

function getPublicMediaUrl(storagePath) {
  const normalized = normalizeStoragePath(storagePath);
  if (!normalized) return '';
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(normalized);
  return data?.publicUrl || '';
}

async function createSignedMediaUrlMap(rows = []) {
  const validRows = (rows || []).filter((row) => normalizeStoragePath(row?.storage_path || row?.public_url || ''));
  if (!validRows.length) return new Map();

  const normalizedPaths = [...new Set(validRows.map((row) => normalizeStoragePath(row.storage_path || row.public_url)).filter(Boolean))];
  const out = new Map();

  try {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(normalizedPaths, 60 * 60);
    if (!error && Array.isArray(data)) {
      data.forEach((entry, index) => {
        if (entry?.signedUrl) out.set(normalizedPaths[index], entry.signedUrl);
      });
    }
  } catch {
    // ignore and fall through to public URL logic
  }

  return out;
}

function buildMediaCandidates(mediaRow, signedUrlMap = new Map()) {
  const normalized = normalizeStoragePath(mediaRow?.storage_path || mediaRow?.public_url || '');
  const candidates = [];
  if (looksLikeHttpUrl(mediaRow?.public_url)) candidates.push(mediaRow.public_url);
  if (normalized) candidates.push(getPublicMediaUrl(normalized));
  if (normalized && signedUrlMap.has(normalized)) candidates.push(signedUrlMap.get(normalized));
  return [...new Set(candidates.filter(Boolean))];
}

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

async function fetchCoverMediaMap(flatIds) {
  if (!flatIds.length) return new Map();
  const { data, error } = await supabase
    .from('inventory_flat_media')
    .select('id, flat_id, media_type, public_url, storage_path, is_cover, sort_order, created_at')
    .in('flat_id', flatIds)
    .order('is_cover', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;

  const grouped = new Map();
  for (const row of data || []) {
    if (!grouped.has(row.flat_id)) grouped.set(row.flat_id, []);
    grouped.get(row.flat_id).push(row);
  }

  const chosenRows = [];
  for (const flatId of flatIds) {
    const chosen = chooseCoverCandidate(grouped.get(flatId) || []);
    if (chosen) chosenRows.push(chosen);
  }

  const signedUrlMap = await createSignedMediaUrlMap(chosenRows);
  const out = new Map();
  for (const row of chosenRows) {
    const normalized = normalizeStoragePath(row.storage_path || row.public_url);
    const candidates = buildMediaCandidates(row, signedUrlMap);
    if (!candidates.length) continue;
    out.set(row.flat_id, [{
      id: row.id,
      flat_id: row.flat_id,
      media_type: row.media_type,
      url: candidates[0],
      fallback_urls: candidates.slice(1),
      storage_path: normalized,
      is_cover: row.is_cover,
      sort_order: row.sort_order || 0,
      created_at: row.created_at,
    }]);
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

  const signedUrlMap = await createSignedMediaUrlMap(data || []);
  const enriched = (data || []).map((row) => {
    const candidates = buildMediaCandidates(row, signedUrlMap);
    return {
      id: row.id,
      flat_id: row.flat_id,
      media_type: row.media_type,
      url: candidates[0] || '',
      fallback_urls: candidates.slice(1),
      storage_path: normalizeStoragePath(row.storage_path || row.public_url),
      is_cover: row.is_cover,
      sort_order: row.sort_order || 0,
      created_at: row.created_at,
    };
  }).filter((item) => item.url);

  return sortMedia(enriched);
}

function normalizeProperty(row, mediaMap, shareCodeMap) {
  const media = mediaMap.get(row.id) || [];
  const fallbackCover = row.cover_image_url && looksLikeHttpUrl(row.cover_image_url) ? [{
    id: `cover-${row.id}`,
    flat_id: row.id,
    media_type: 'image',
    url: row.cover_image_url,
    fallback_urls: [],
    storage_path: null,
    is_cover: true,
    sort_order: 0,
  }] : [];

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

const PUBLIC_SELECT = `
  id,
  society_name,
  city,
  locality,
  sub_locality,
  bhk,
  property_type,
  monthly_rent,
  deposit,
  maintenance,
  furnishing_status,
  sq_ft,
  bathrooms,
  balconies,
  available_from,
  listing_status,
  business_status,
  visibility_status,
  description,
  cover_image_url,
  handler_whatsapp_number,
  handler_name,
  updated_at
`;

async function fetchSupabasePropertiesPage(page = 1, pageSize = PUBLIC_PAGE_SIZE) {
  const start = Math.max(0, (page - 1) * pageSize);
  const end = start + pageSize; // fetch one extra row for hasMore

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
  const flatIds = pageRows.map((row) => row.id);
  const [coverMediaMap, shareCodeMap] = await Promise.all([
    fetchCoverMediaMap(flatIds),
    fetchShareCodeMap(flatIds),
  ]);

  return {
    items: pageRows.map((row) => normalizeProperty(row, coverMediaMap, shareCodeMap)),
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

export async function getPreviewPropertiesPage(page = 1, pageSize = PUBLIC_PAGE_SIZE) {
  if (!hasSupabase) throw new Error('Supabase is not configured for the public app.');
  return fetchSupabasePropertiesPage(page, pageSize);
}


export async function fetchPreviewPropertiesByIds(flatIds = []) {
  if (!hasSupabase) throw new Error('Supabase is not configured for the public app.');
  const normalizedIds = [...new Set((flatIds || []).map((id) => Number(id)).filter(Boolean))];
  if (!normalizedIds.length) return [];

  const { data, error } = await supabase
    .from('inventory_flats')
    .select(PUBLIC_SELECT)
    .in('id', normalizedIds)
    .eq('listing_status', 'live')
    .eq('business_status', 'available');

  if (error) throw error;

  const rows = data || [];
  const rowMap = new Map(rows.map((row) => [row.id, row]));
  const orderedRows = normalizedIds.map((id) => rowMap.get(id)).filter(Boolean);
  const orderedFlatIds = orderedRows.map((row) => row.id);
  const [coverMediaMap, shareCodeMap] = await Promise.all([
    fetchCoverMediaMap(orderedFlatIds),
    fetchShareCodeMap(orderedFlatIds),
  ]);

  return orderedRows.map((row) => normalizeProperty(row, coverMediaMap, shareCodeMap));
}

export async function getPreviewPropertyByShareCode(propertyRef) {
  if (!hasSupabase) throw new Error('Supabase is not configured for the public app.');
  return fetchSupabasePropertyByRef(propertyRef);
}

export function getCoverImage(property) {
  return property?.media?.[0]?.url || '';
}


export async function getAvailableLocalities() {
  if (!hasSupabase) throw new Error('Supabase is not configured for the public app.');
  const { data, error } = await supabase
    .from('inventory_flats')
    .select('locality')
    .eq('listing_status', 'live')
    .eq('business_status', 'available')
    .not('locality', 'is', null)
    .order('locality', { ascending: true })
    .limit(1000);

  if (error) throw error;

  return [...new Set((data || []).map((row) => String(row.locality || '').trim()).filter(Boolean))];
}

export async function getRentBoundsForLocalities(localities = []) {
  if (!hasSupabase) throw new Error('Supabase is not configured for the public app.');
  const selected = [...new Set((localities || []).map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 3);

  let query = supabase
    .from('inventory_flats')
    .select('monthly_rent, locality')
    .eq('listing_status', 'live')
    .eq('business_status', 'available')
    .not('monthly_rent', 'is', null)
    .order('monthly_rent', { ascending: true })
    .limit(1000);

  if (selected.length) {
    query = query.in('locality', selected);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rents = (data || [])
    .map((row) => Number(row.monthly_rent))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  if (!rents.length) return { min: 0, max: 0 };
  return { min: rents[0], max: rents[rents.length - 1] };
}

export { PUBLIC_PAGE_SIZE };

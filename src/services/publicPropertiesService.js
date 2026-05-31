import { hasSupabase, supabase } from '../lib/supabaseClient.js';

export const PUBLIC_PAGE_SIZE = 12;

// ── HTTP helper ──────────────────────────────────────────────

async function apiFetch(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ── CDN-cached routes (go through Vercel edge) ───────────────
// These never hit Supabase directly from the browser.
// First request per cache key → Vercel serverless → Supabase.
// All subsequent requests within the TTL → served from Vercel CDN.

export async function getFilterOptions() {
  return apiFetch('/api/filter-options');
}

export async function getAvailableLocalities() {
  const data = await apiFetch('/api/filter-options');
  return data.localities || [];
}

export async function getPreviewPropertiesPage(page = 1) {
  return apiFetch(`/api/properties?page=${page}`);
}

export async function fetchPropertiesWithFilters(filters = {}, page = 1) {
  const params = new URLSearchParams({ page: String(page) });
  if (filters.localities?.length) params.set('localities', filters.localities.join(','));
  if (filters.city)             params.set('city', filters.city);
  if (filters.propertyType)     params.set('propertyType', filters.propertyType);
  if (filters.furnishingStatus) params.set('furnishingStatus', filters.furnishingStatus);
  if (filters.bhk)              params.set('bhk', filters.bhk);
  if (filters.sortBy)           params.set('sortBy', filters.sortBy);
  if (filters.search)           params.set('search', filters.search);
  return apiFetch(`/api/properties?${params}`);
}

export async function fetchPropertiesForLocalitiesPage(localities = [], page = 1) {
  return fetchPropertiesWithFilters({ localities }, page);
}

export async function fetchPreviewPropertiesByIds(flatIds = []) {
  const ids = [...new Set((flatIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return [];
  return apiFetch(`/api/properties?ids=${ids.join(',')}`);
}

export async function getPreviewPropertyByShareCode(shareCode) {
  return apiFetch(`/api/property?shareCode=${encodeURIComponent(shareCode)}`);
}

export function getCoverImage(property) {
  return property?.media?.[0]?.url || '';
}

// ── Direct Supabase (dynamic / user-specific queries) ────────
// These don't benefit from CDN caching: rent bounds change per locality
// selection and are already cached in TanStack Query for 5 minutes.

export async function getRentBoundsForLocalities(localities = []) {
  if (!hasSupabase) throw new Error('Supabase is not configured.');
  const selected = [...new Set((localities || []).map((l) => String(l || '').trim()).filter(Boolean))].slice(0, 3);

  function base() {
    let q = supabase.from('public_listings').select('monthly_rent').not('monthly_rent', 'is', null);
    if (selected.length) q = q.in('locality', selected);
    return q;
  }

  const [{ data: minData, error: minErr }, { data: maxData, error: maxErr }] = await Promise.all([
    base().order('monthly_rent', { ascending: true }).limit(1),
    base().order('monthly_rent', { ascending: false }).limit(1),
  ]);

  if (minErr) throw minErr;
  if (maxErr) throw maxErr;

  const min = Number(minData?.[0]?.monthly_rent || 0);
  const max = Number(maxData?.[0]?.monthly_rent || 0);
  return (!min || !max) ? { min: 0, max: 0 } : { min, max };
}

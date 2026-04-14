import { hasSupabase, supabase } from '../lib/supabaseClient.js';
import { fetchPreviewPropertiesByIds } from './publicPropertiesService.js';

const TABLE = 'user_liked_properties';
const USER_PROFILE_KEY = 'user_profile_id';
const FLAT_KEY = 'flat_id';

function ensureConfigured() {
  if (!hasSupabase) {
    throw new Error('Supabase is not configured for this app.');
  }
}

async function fetchSavedRows(profileId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(`id, created_at, ${USER_PROFILE_KEY}, ${FLAT_KEY}`)
    .eq(USER_PROFILE_KEY, profileId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function getSavedPropertyIds(profileId) {
  ensureConfigured();
  if (!profileId) return [];

  const rows = await fetchSavedRows(profileId);
  return rows.map((row) => row?.[FLAT_KEY]).filter(Boolean);
}

export async function isPropertySaved(profileId, flatId) {
  if (!profileId || !flatId) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .select('id')
    .eq(USER_PROFILE_KEY, profileId)
    .eq(FLAT_KEY, flatId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function toggleSavedProperty(profileId, flatId, isCurrentlySaved) {
  ensureConfigured();
  if (!profileId || !flatId) {
    throw new Error('Missing property or profile context.');
  }

  if (isCurrentlySaved) {
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq(USER_PROFILE_KEY, profileId)
      .eq(FLAT_KEY, flatId);

    if (error) {
      throw error;
    }

    return { saved: false };
  }

  const existing = await isPropertySaved(profileId, flatId);
  if (existing) {
    return { saved: true };
  }

  const { error } = await supabase
    .from(TABLE)
    .insert({
      [USER_PROFILE_KEY]: profileId,
      [FLAT_KEY]: flatId,
    });

  if (error && error.code !== '23505') {
    throw error;
  }

  return { saved: true };
}

export async function getSavedProperties(profileId) {
  ensureConfigured();
  if (!profileId) return [];

  const flatIds = await getSavedPropertyIds(profileId);
  if (!flatIds.length) return [];

  return fetchPreviewPropertiesByIds(flatIds);
}

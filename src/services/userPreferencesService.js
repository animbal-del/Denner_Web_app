import { hasSupabase, supabase } from '../lib/supabaseClient.js';

const TABLE = 'user_preferences';

function ensureConfigured() {
  if (!hasSupabase) {
    throw new Error('Supabase is not configured for this app.');
  }
}

function normalizeLocalities(localities = []) {
  return [...new Set((localities || []).map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 3);
}

export function buildEmptyPreferences() {
  return {
    preferred_city: '',
    preferred_state: '',
    preferred_localities: [],
    rent_min: '',
    rent_max: '',
    move_in_timeline: '',
    is_first_visit_form_completed: false,
  };
}

export async function getUserPreferences(profileId) {
  ensureConfigured();
  if (!profileId) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select('id, profile_id, preferred_city, preferred_state, preferred_localities, rent_min, rent_max, move_in_timeline, is_first_visit_form_completed, updated_at')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertUserPreferences(profileId, payload) {
  ensureConfigured();
  if (!profileId) {
    throw new Error('Missing profile context.');
  }

  const nextPayload = {
    profile_id: profileId,
    preferred_city: payload.preferred_city || null,
    preferred_state: payload.preferred_state || null,
    preferred_localities: normalizeLocalities(payload.preferred_localities),
    rent_min: payload.rent_min === '' || payload.rent_min === null || payload.rent_min === undefined ? null : Number(payload.rent_min),
    rent_max: payload.rent_max === '' || payload.rent_max === null || payload.rent_max === undefined ? null : Number(payload.rent_max),
    move_in_timeline: payload.move_in_timeline || null,
    is_first_visit_form_completed: Boolean(payload.is_first_visit_form_completed),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(nextPayload, { onConflict: 'profile_id' })
    .select('id, profile_id, preferred_city, preferred_state, preferred_localities, rent_min, rent_max, move_in_timeline, is_first_visit_form_completed, updated_at')
    .single();

  if (error) throw error;
  return data;
}

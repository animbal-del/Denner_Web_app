import { hasSupabase, supabase } from '../lib/supabaseClient.js';

const TABLE = 'urgent_help_requests';

function normalizeLocalities(localities = []) {
  return [...new Set((localities || []).map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 3);
}

export function buildEmptyUrgentHelp(profile = null) {
  return {
    name_snapshot: profile?.full_name || '',
    phone_snapshot: profile?.phone || '',
    city: profile?.city || '',
    state: profile?.state || '',
    preferred_localities: [],
    rent_min: '',
    rent_max: '',
    required_by_date: '',
    consent_to_contact: false,
    notes: '',
  };
}

export async function createUrgentHelpRequest(profileId, payload) {
  if (!hasSupabase) {
    throw new Error('Supabase is not configured for this app.');
  }

  if (!profileId) {
    throw new Error('Missing profile context.');
  }

  const insertPayload = {
    user_profile_id: profileId,
    name_snapshot: payload.name_snapshot || null,
    phone_snapshot: payload.phone_snapshot || null,
    city: payload.city || null,
    state: payload.state || null,
    preferred_localities: normalizeLocalities(payload.preferred_localities),
    rent_min: payload.rent_min === '' || payload.rent_min === null || payload.rent_min === undefined ? null : Number(payload.rent_min),
    rent_max: payload.rent_max === '' || payload.rent_max === null || payload.rent_max === undefined ? null : Number(payload.rent_max),
    required_by_date: payload.required_by_date || null,
    consent_to_contact: Boolean(payload.consent_to_contact),
    status: 'new',
    notes: payload.notes || null,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert(insertPayload)
    .select('id, user_profile_id, name_snapshot, phone_snapshot, city, state, preferred_localities, rent_min, rent_max, required_by_date, consent_to_contact, status, notes, created_at')
    .single();

  if (error) throw error;
  return data;
}

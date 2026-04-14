import { hasSupabase, supabase } from '../lib/supabaseClient.js';

export async function updateUserProfile(profileId, payload) {
  if (!hasSupabase) {
    throw new Error('Supabase is not configured for this app.');
  }

  if (!profileId) {
    throw new Error('Missing profile context.');
  }

  const nextPayload = {
    full_name: payload.full_name || null,
    phone: payload.phone || null,
    email: payload.email || null,
    city: payload.city || null,
    state: payload.state || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('profiles')
    .update(nextPayload)
    .eq('id', profileId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

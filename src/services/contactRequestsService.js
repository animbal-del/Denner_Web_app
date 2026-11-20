import { hasSupabase, supabase } from '../lib/supabaseClient.js';

const clip = (v, n) => (String(v || '').trim().slice(0, n) || null);

// Saves a "Talk to us" request. Insert-only: RLS gives the site no read access,
// so we don't ask for the row back.
export async function createContactRequest(profileId, payload) {
  if (!hasSupabase) throw new Error('Supabase is not configured for this app.');
  const { error } = await supabase.from('contact_requests').insert({
    user_profile_id: profileId || null,
    name: clip(payload.name, 120),
    flat_size: clip(payload.flatSize, 20),
    preferred_area: clip(payload.area, 200),
    budget: clip(payload.budget, 40),
    moving_in: clip(payload.movingIn, 40),
    source_path: clip(payload.sourcePath, 200),
  });
  if (error) throw error;
}

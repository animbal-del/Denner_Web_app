import { supabase, hasSupabase } from '../lib/supabaseClient.js';
import { fetchPreviewPropertiesByIds } from './publicPropertiesService.js';

const DEFAULT_DENNER_WHATSAPP = import.meta.env.VITE_DEFAULT_DENNER_WHATSAPP || '+919156005618';

function cleanOptional(value) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function normalizePhoneForWa(raw = '') {
  return String(raw || '').replace(/[^\d]/g, '');
}

function getPropertyShareUrl(property) {
  const ref = property?.share_code || `flat-${property?.id}`;
  const base = String(import.meta.env.VITE_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '') || '').replace(/\/$/, '');
  if (!base || !ref) return '';
  return `${base}/property/${ref}`;
}

function buildVisitWhatsappMessage({ property, preferences, profile }) {
  const flatRef = property?.share_code || `flat-${property?.id}`;
  const shareUrl = getPropertyShareUrl(property);
  const lines = [
    `Hi ${property?.handler_name || 'Denner'},`,
    '',
    `I want to schedule a visit for ${property?.society_name || 'this property'}.`,
    `DNR flat code: ${flatRef}`,
  ];

  if (shareUrl) lines.push(`Property link: ${shareUrl}`);
  if (property?.locality || property?.city) {
    lines.push(`Location: ${[property?.locality, property?.city].filter(Boolean).join(', ')}`);
  }
  if (property?.bhk) lines.push(`Configuration: ${property.bhk}`);
  if (property?.monthly_rent) lines.push(`Rent: ₹${Number(property.monthly_rent).toLocaleString('en-IN')}`);

  const localities = preferences?.preferred_localities || [];
  if (localities.length) lines.push(`Preferred localities: ${localities.join(', ')}`);
  if (preferences?.rent_min || preferences?.rent_max) {
    const min = preferences?.rent_min ? `₹${Number(preferences.rent_min).toLocaleString('en-IN')}` : 'Open';
    const max = preferences?.rent_max ? `₹${Number(preferences.rent_max).toLocaleString('en-IN')}` : 'Open';
    lines.push(`Budget: ${min} to ${max}`);
  }
  if (profile?.full_name) lines.push(`Name: ${profile.full_name}`);
  if (profile?.phone) lines.push(`Phone: ${profile.phone}`);
  lines.push('', 'Please help me with the next step for the visit.');
  return lines.join('\n');
}

/**
 * Check if the user has already submitted a visit request for this flat.
 * Returns the existing record if found, otherwise null.
 */
export async function getExistingVisitRequest(profileId, flatId) {
  if (!hasSupabase) return null;
  if (!profileId || !flatId) return null;

  const { data, error } = await supabase
    .from('visit_requests')
    .select('id, flat_id, status, created_at, whatsapp_message_text')
    .eq('user_profile_id', profileId)
    .eq('flat_id', flatId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data || null;
}

export async function createVisitRequest({ profile, property, preferences }) {
  if (!hasSupabase) throw new Error('Supabase is not configured for this app.');
  if (!profile?.id) throw new Error('You must be logged in as a renter to request a visit.');
  if (!property?.id) throw new Error('Missing property for visit request.');

  // ── Duplicate guard ───────────────────────────────────────────────────────
  // Check if a visit request already exists for this user+flat combination.
  // If it does, skip inserting a new row and reuse the existing WhatsApp message
  // so the inventory management app doesn't accumulate duplicate entries.
  const existing = await getExistingVisitRequest(profile.id, property.id);

  const whatsappMessage = buildVisitWhatsappMessage({ property, preferences, profile });
  const whatsappNumber = cleanOptional(property?.handler_whatsapp_number) || DEFAULT_DENNER_WHATSAPP;
  const whatsappUrl = `https://wa.me/${normalizePhoneForWa(whatsappNumber)}?text=${encodeURIComponent(whatsappMessage)}`;

  if (existing) {
    // Return the existing record + the freshly-built WhatsApp URL (user
    // preferences may have changed, so we still open WA with updated message)
    // but we do NOT insert another row into visit_requests.
    return {
      record: existing,
      whatsappUrl,
      whatsappMessage,
      whatsappNumber,
      isDuplicate: true,
    };
  }
  // ─────────────────────────────────────────────────────────────────────────

  const payload = {
    flat_id: property.id,
    user_profile_id: profile.id,
    flat_code_snapshot: property.share_code || `flat-${property.id}`,
    request_source: 'property_detail',
    first_time_form_snapshot: preferences?.is_first_visit_form_completed ? null : {
      preferred_localities: preferences?.preferred_localities || [],
      rent_min: preferences?.rent_min || null,
      rent_max: preferences?.rent_max || null,
    },
    preferred_localities_snapshot: preferences?.preferred_localities || [],
    rent_min_snapshot: preferences?.rent_min ? Number(preferences.rent_min) : null,
    rent_max_snapshot: preferences?.rent_max ? Number(preferences.rent_max) : null,
    whatsapp_number_used: cleanOptional(profile?.phone),
    whatsapp_message_text: whatsappMessage,
    status: 'new',
    scheduled_date: null,
    scheduled_time: null,
    user_notes: null,
  };

  const { data, error } = await supabase
    .from('visit_requests')
    .insert(payload)
    .select('id, flat_id, flat_code_snapshot, user_profile_id, status, whatsapp_message_text, whatsapp_number_used, created_at')
    .single();

  if (error) throw error;

  return { record: data, whatsappUrl, whatsappMessage, whatsappNumber, isDuplicate: false };
}

export async function getVisitRequests(profileId) {
  if (!hasSupabase) throw new Error('Supabase is not configured for this app.');
  if (!profileId) return [];

  const { data, error } = await supabase
    .from('visit_requests')
    .select('id, flat_id, status, whatsapp_message_text, created_at')
    .eq('user_profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rows = data || [];
  const properties = await fetchPreviewPropertiesByIds(rows.map((row) => row.flat_id));
  const propertyMap = new Map(properties.map((item) => [item.id, item]));

  return rows.map((row) => ({
    ...row,
    property: propertyMap.get(row.flat_id) || null,
  }));
}

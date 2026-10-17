// Measurement layer: a PII-safe event helper and read access to the ad-click
// attribution. Consent defaults, attribution capture and the GTM loader run
// earlier, from public/analytics-boot.js. GTM is inert unless VITE_GTM_ID is set.
//
// GA4, Google Ads and their triggers live in the GTM container — the app only
// pushes named events to window.dataLayer. Never add names, phones, emails or
// WhatsApp message text to an event: track() drops any key not in ALLOWED_PARAMS.

const GTM_ID = import.meta.env.VITE_GTM_ID;

const ALLOWED_PARAMS = [
  'property_id',
  'property_name',
  'bhk',
  'locality',
  'rent',
  'source',
  'auth_state',
  'method',
  'transaction_id',
  'is_repeat',
];

// Written by public/analytics-boot.js on a tagged landing; keep the key in sync.
const ATTRIBUTION_KEY = 'denner_attribution';
const ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function dataLayer() {
  window.dataLayer = window.dataLayer || [];
  return window.dataLayer;
}

function buildEvent(event, params = {}) {
  const payload = { event };
  // Every allowed key is always set (null when absent) so values from a
  // previous push never leak into this event through GTM's data-layer merge.
  ALLOWED_PARAMS.forEach((key) => {
    const value = params[key];
    payload[key] = value === undefined || value === '' ? null : value;
  });
  return payload;
}

export function track(event, params) {
  if (typeof window === 'undefined') return;
  const payload = buildEvent(event, params);
  if (import.meta.env.DEV) console.debug('[analytics]', payload);
  dataLayer().push(payload);
}

// Push an event, then run `callback` once GTM has fired its tags (or after
// `timeoutMs` if GTM is absent or blocked). Used before leaving for WhatsApp.
export function trackThen(event, params, callback, timeoutMs = 800) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    callback();
  };
  if (typeof window === 'undefined') { finish(); return; }
  const payload = buildEvent(event, params);
  if (import.meta.env.DEV) console.debug('[analytics]', payload);
  if (GTM_ID) {
    payload.eventCallback = finish;
    payload.eventTimeout = timeoutMs;
  }
  dataLayer().push(payload);
  if (!GTM_ID) finish();
  else setTimeout(finish, timeoutMs + 200);
}

// Non-PII property fields shared by every property-scoped event.
export function propertyParams(property) {
  if (!property) return {};
  return {
    property_id: property.id != null ? String(property.id) : undefined,
    property_name: property.society_name || undefined,
    bhk: property.bhk || undefined,
    locality: property.locality || undefined,
    rent: property.monthly_rent ? Number(property.monthly_rent) : undefined,
  };
}

export function getAttribution() {
  try {
    const raw = localStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.captured_at || Date.now() - Date.parse(data.captured_at) > ATTRIBUTION_TTL_MS) {
      localStorage.removeItem(ATTRIBUTION_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

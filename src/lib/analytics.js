// Measurement layer: Google Tag Manager bootstrap, a PII-safe event helper, and
// first-touch ad attribution capture. GTM is inert unless VITE_GTM_ID is set.
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

// EEA + UK + CH: GA/Ads storage is denied by default there (Consent Mode v2).
// Everywhere else (India is the target market) it defaults to granted.
const CONSENT_DENIED_REGIONS = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO',
  'SK', 'SI', 'ES', 'SE', 'GB', 'CH',
];

const ATTRIBUTION_KEY = 'denner_attribution';
const ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const ATTRIBUTION_PARAMS = [
  'gclid', 'gbraid', 'wbraid',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
];

function dataLayer() {
  window.dataLayer = window.dataLayer || [];
  return window.dataLayer;
}

// Consent commands must be pushed as an `arguments` object, exactly like gtag().
function gtag() {
  dataLayer().push(arguments);
}

// Runs once, before React renders, so GTM sees the landing URL (with gclid)
// on the very first page view.
export function initAnalytics() {
  if (typeof window === 'undefined' || window.__dennerAnalyticsInit) return;
  window.__dennerAnalyticsInit = true;

  captureAttribution();

  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    region: CONSENT_DENIED_REGIONS,
  });
  gtag('consent', 'default', {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted',
  });

  if (!GTM_ID) return;
  dataLayer().push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  // Injected via JS (not an inline <script>) so it works under the strict CSP.
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(GTM_ID)}`;
  document.head.appendChild(script);
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

// Store the latest ad click / UTM set from the landing URL. A new tagged
// landing replaces the old one (last paid touch wins, matching Google Ads).
function captureAttribution() {
  try {
    const params = new URLSearchParams(window.location.search);
    const found = {};
    ATTRIBUTION_PARAMS.forEach((key) => {
      const value = params.get(key);
      if (value) found[key] = value.slice(0, 200);
    });
    if (!Object.keys(found).length) return;
    found.landing_path = window.location.pathname.slice(0, 200);
    found.captured_at = new Date().toISOString();
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(found));
  } catch {}
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

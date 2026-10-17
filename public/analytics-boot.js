// Analytics bootstrap: consent defaults, ad-click attribution capture and the
// GTM loader. Served as a plain deferred script (injected into index.html by
// vite.config.js) so it runs as soon as the HTML is parsed, instead of after
// the ~550 KB app bundle has downloaded. On slow mobile that is the difference
// between an ad-click bounce recording a page_view or not.
//
// The GTM container id arrives as data-gtm-id; without it GTM stays off, but
// consent defaults and attribution capture still run. Event helpers and
// getAttribution() live in src/lib/analytics.js.
(function () {
  if (window.__dennerAnalyticsInit) return;
  window.__dennerAnalyticsInit = true;

  var script = document.currentScript;
  var gtmId = script && script.getAttribute('data-gtm-id');

  // EEA + UK + CH: GA/Ads storage is denied by default there (Consent Mode v2).
  // Everywhere else (India is the target market) it defaults to granted.
  var CONSENT_DENIED_REGIONS = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
    'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO',
    'SK', 'SI', 'ES', 'SE', 'GB', 'CH',
  ];

  // Keep in sync with ATTRIBUTION_KEY in src/lib/analytics.js.
  var ATTRIBUTION_KEY = 'denner_attribution';
  var ATTRIBUTION_PARAMS = [
    'gclid', 'gbraid', 'wbraid',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  ];

  window.dataLayer = window.dataLayer || [];
  // Consent commands must be pushed as an `arguments` object, exactly like gtag().
  function gtag() {
    window.dataLayer.push(arguments);
  }

  // Store the latest ad click / UTM set from the landing URL. A new tagged
  // landing replaces the old one (last paid touch wins, matching Google Ads).
  try {
    var params = new URLSearchParams(window.location.search);
    var found = {};
    var any = false;
    ATTRIBUTION_PARAMS.forEach(function (key) {
      var value = params.get(key);
      if (value) {
        found[key] = value.slice(0, 200);
        any = true;
      }
    });
    if (any) {
      found.landing_path = window.location.pathname.slice(0, 200);
      found.captured_at = new Date().toISOString();
      localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(found));
    }
  } catch (e) {}

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

  if (!gtmId) return;
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  // Injected via JS (not an inline <script>) so it works under the strict CSP.
  var gtm = document.createElement('script');
  gtm.async = true;
  gtm.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(gtmId);
  document.head.appendChild(gtm);
})();

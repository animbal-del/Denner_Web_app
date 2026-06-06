import { useEffect } from 'react';

// Microsoft Clarity (heatmaps + session recordings). Inert unless
// VITE_CLARITY_PROJECT_ID is set in the environment. We inject the tag via JS
// (not an inline <script>) so it works under a strict CSP with script-src 'self'
// — the loaded tag itself is allowed via the *.clarity.ms CSP entries.
export default function Clarity() {
  useEffect(() => {
    const id = import.meta.env.VITE_CLARITY_PROJECT_ID;
    if (!id || typeof window === 'undefined' || window.clarity) return;
    (function (c, l, a, r, i) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      const t = l.createElement(r);
      t.async = 1;
      t.src = 'https://www.clarity.ms/tag/' + i;
      const y = l.getElementsByTagName(r)[0];
      y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', id);
  }, []);
  return null;
}

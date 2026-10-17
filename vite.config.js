import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Boot analytics from public/analytics-boot.js, a small deferred script that
// runs as soon as the HTML is parsed rather than after the app bundle has
// downloaded, and preload the GTM container it injects (same URL, so the
// browser reuses the response). On slow mobile this lets a quick ad-click
// bounce still record a page_view. GTM stays off when VITE_GTM_ID is unset.
function analyticsBoot(gtmId) {
  return {
    name: 'denner-analytics-boot',
    transformIndexHtml() {
      const tags = [
        {
          tag: 'script',
          attrs: { src: '/analytics-boot.js', defer: true, ...(gtmId ? { 'data-gtm-id': gtmId } : {}) },
          injectTo: 'head-prepend',
        },
      ];
      if (gtmId) {
        tags.unshift({
          tag: 'link',
          attrs: { rel: 'preload', as: 'script', href: `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}` },
          injectTo: 'head-prepend',
        });
      }
      return tags;
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), analyticsBoot(loadEnv(mode, process.cwd(), 'VITE_').VITE_GTM_ID)],
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 5173,
    strictPort: Boolean(process.env.PORT),
  },
}));

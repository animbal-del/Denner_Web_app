# Denner Web — Architecture Audit & Integration Plan
### Vercel + Cloudflare R2 + Domain (mydenner.com) + Supabase

**Date:** 2026-06-02
**Repo:** `denner-web-phase4` (branch `main`)
**Scope:** Full codebase audit (security, database/querying, performance/egress, frontend/auth, serverless config) + an integration plan to wire Vercel hosting, Cloudflare R2 media storage, the new `mydenner.com` domain, and Supabase into one coherent, secure, low-egress architecture.

**How this was produced:** Three parallel code audits (security, Vercel/serverless config, frontend/auth) plus direct live validation against the production Supabase database (read-only `psql` over the IPv4 pooler) and direct inspection of `vercel.json`, `api/media.js`, `api/og.js`, and env files. Findings personally verified against the DB or git diff are marked **✓ verified**; findings reported by audit agents from source are marked **(source)**.

---

## 0. TL;DR — Severity Overview

| # | Finding | Severity | Area | Verified |
|---|---------|----------|------|----------|
| S1 | Reflected XSS in `og.js` via `shareCode` in inline script | **HIGH** | Security | (source) |
| S2 | No security headers (CSP / X-Frame-Options / HSTS / nosniff) | **HIGH** | Security | (source) |
| C1 | SPA catch-all rewrite deleted from `vercel.json` → deep-link/refresh may 404 | **HIGH** | Config | ✓ verified |
| C2 | Vercel functions not pinned to Mumbai (`bom1`) → US↔India latency per request | **HIGH** | Config/Perf | ✓ verified |
| A1 | Client-side role checks are trust-only; security depends on Supabase RLS (not in repo) | **HIGH** | Auth | (source) |
| S3 | Media proxy: object-enumeration of entire bucket (no path/listing allow-list) | **MED** | Security | ✓ verified |
| S4 | Media proxy: unbounded upstream fetch + Sharp decompression-bomb exposure | **MED** | Security/DoS | ✓ verified |
| S5 | No rate limiting on any public API route | **MED** | Security/DoS | (source) |
| E1 | Cover-media fetch unbounded: 82 rows pulled per 12-card page, ~85% discarded | **MED** | Egress | ✓ verified |
| E2 | List projection over-fetches: full row 1313 B vs slim 479 B (63% waste) | **MED** | Egress | ✓ verified |
| E3 | Search has no debounce → ~6 full requests per typed term | **MED** | Egress | (source) |
| A2 | Missing 404 route → blank pages on unknown URLs | **MED** | Frontend | (source) |
| A3 | Share links use `window.location.origin`, not `VITE_PUBLIC_SITE_URL` (breaks on previews) | **MED** | Frontend/Domain | (source) |
| A4 | `logout()` doesn't clear React Query cache → cross-account data flash | **MED** | Auth | (source) |
| C3 | `rent-bounds.js` creates a fresh Supabase client per request | **MED** | Config | (source) |
| C4 | No HTTP method guards on API routes (accept POST/PUT/etc.) | **MED** | Config | (source) |
| C5 | `add-indexes.sql` + `get_filter_options` RPC are gitignored → deployment drift | **MED** | Ops | ✓ verified |
| Misc | ~15 LOW items (a11y, error boundaries, negative caching, dedup) | **LOW** | Various | (source) |

> **Reality check on scale:** the live catalog is **189 listings / 221 media rows**. Performance is not currently a problem (queries run in <35 ms). The egress and architecture items are about **bytes shipped, cost trajectory, and correctness/security**, not present-day slowness. Prioritize **security + correctness (C1, S1, S2, A1)** over micro-optimizations.

---

## 1. Current Architecture (as-is)

```
                          ┌────────────────────────────────────────────┐
   Browser (React SPA) ───┤  Vercel (region: default US/iad1 — NOT bom1)│
        │                 │                                            │
        │  /api/properties │   api/properties.js ─┐                     │
        │  /api/property   │   api/property.js    ├─► api/_db.js ──┐    │
        │  /api/filter-... │   api/filter-options ┘  (service-role)│    │
        │  /api/rent-bounds│   api/rent-bounds.js  (own client)    │    │
        │  /og/:code       │   api/og.js (OG meta + JS redirect)   │    │
        │  /api/media?path │   api/media.js (Sharp resize, proxy)  │    │
        └──────────────────┴───────────────────────────────────────┼────┘
                                                                    │
                                       ┌────────────────────────────▼─────────────┐
                                       │ Supabase (ap-south-1 / Mumbai)            │
                                       │  Postgres: public_listings (view) ◄─ inventory_flats
                                       │            inventory_flat_media, property_share_links
                                       │  Storage : property-media bucket (public) │
                                       │  Auth    : email/password, anon-key sessions
                                       └───────────────────────────────────────────┘
```

**Data path facts (✓ verified live):**
- `public_listings` is a **plain view** (`relkind = v`): a filtered projection of `inventory_flats` (32 columns) `WHERE listing_status='live' AND business_status='available'`. All base-table indexes apply to it.
- Public API reads use the **service-role key** server-side only (confirmed absent from the built client bundle `dist/`).
- Frontend ships the **anon key** (expected) and talks to Supabase Auth directly; the browser also writes `profiles`/`partner_profiles`/`visit_requests`/`urgent_help_requests` directly — so **all real authorization rests on Supabase RLS** (see A1).
- Media: image bytes come from Supabase **Storage** (object storage), proxied + resized by `api/media.js` and cached 7 days at the Vercel CDN. This is **separate** from DB egress.

---

## 2. Live Database Facts (✓ verified via read-only psql)

| Metric | Value | Implication |
|--------|-------|-------------|
| Live listings (`public_listings`) | **189** | Small catalog; seq scans are cheap |
| Total media rows | **221** (avg 7.5/flat, max 40) | — |
| Media rows pulled for a 12-card page | **82** | ~85% fetched then discarded (E1) |
| Avg full-row JSON | **1313 bytes** | E2 baseline |
| Avg slim-row JSON (10 cols) | **479 bytes** | **63% smaller** if projection trimmed |
| `description` total across all rows | **45.8 KB** (avg 248 chars, max 519) | Modest at this scale |
| Text search (`OR ilike` ×4 cols) | seq scan, **32 ms**, 33 buffers | Fine now; `pg_trgm` premature |
| `pg_trgm` extension | available, **not installed** | Don't install yet |

**Indexes present (✓ verified):** `inventory_flats` has updated_at, city+updated, locality+updated, rent (partial WHERE not null), a partial status index, plus several more — **arguably over-indexed** for 222 rows. `inventory_flat_media` has `idx_flat_media_cover (flat_id, is_cover, sort_order)` — which means the E1 fix (`DISTINCT ON`) will be index-supported.

**Connection note:** the direct host `db.<ref>.supabase.co` is **IPv6-only**; from an IPv4 machine use the pooler `aws-1-ap-south-1.pooler.supabase.com:5432`, user `postgres.<ref>`. (Saved to project memory.)

---

## 3. Findings by Domain

### 3A. Security

**S1 — Reflected XSS in OG endpoint (HIGH).** `api/og.js:116,153`
`propertyUrl` is built from the raw `shareCode` query param and emitted into an inline script via `window.location.replace(${JSON.stringify(propertyUrl)})`. `JSON.stringify` escapes `"` and `\` but **not** `<` or `/`, so `/og/</script><script>…` breaks out of the `<script>` and executes attacker JS in the site origin. The `escapeHtml()` on the meta tags does not cover the JS-string context.
**Countermeasure:** validate `shareCode` against `^[A-Za-z0-9_-]{1,64}$` and 400 on mismatch; additionally drop the inline `window.location.replace` in favor of a `302`/`<meta http-equiv="refresh">` redirect so a strict CSP without `'unsafe-inline'` becomes viable.

**S2 — No security headers (HIGH).** `vercel.json` (only an `/assets/*` cache header exists)
No CSP, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, or HSTS. Amplifies S1 and leaves the app clickjackable / MIME-sniffable.
**Countermeasure:** add a global `headers` block for `/(.*)`:
```json
{ "source": "/(.*)", "headers": [
  { "key": "X-Content-Type-Options", "value": "nosniff" },
  { "key": "X-Frame-Options", "value": "DENY" },
  { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
  { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
  { "key": "Content-Security-Policy", "value": "default-src 'self'; img-src 'self' https://*.supabase.co data:; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'" }
] }
```
(Fix S1 first so the inline script can be removed and CSP need not allow `'unsafe-inline'` for scripts.)

**S3 — Media proxy is an object-enumeration oracle (MED).** `api/media.js:16,22` (✓ verified)
`storagePath` is only stripped of leading slashes, then concatenated into the public-bucket URL. Anyone can request **any** object in the public `property-media` bucket — including media for draft/unlisted/deleted flats that `public_listings` deliberately hides. Pinned to `${SUPABASE_URL}`, so not external SSRF, but it bypasses listing visibility.
**Countermeasure:** reject `..`, backslashes, and control chars; ideally validate the path against `inventory_flat_media.storage_path` for flats in `public_listings`, or issue a short-lived signed token in `_db.js` that the proxy verifies. **This concern largely disappears under the R2 plan (§4B)** if R2 is fronted by signed/scoped access.

**S4 — Unbounded fetch + Sharp decompression bomb (MED).** `api/media.js:30,40-43` (✓ verified)
`await upstream.arrayBuffer()` buffers the whole object with no size cap; Sharp runs with no `limitInputPixels`/`failOn`/concurrency limits. A huge image can exhaust function memory/CPU.
**Countermeasure:** check `content-length` and reject > ~15 MB; `sharp(body, { limitInputPixels: 24_000_000, failOn: 'truncated' })`; `sharp.concurrency(1)`.

**S5 — No rate limiting (MED).** all `api/*` routes
CDN caching only protects repeated identical URLs; varying `?w`/`?q`/`?path`/`?search` bypasses it and hits the function (and Supabase). `media.js` is the most expensive (Sharp + fetch).
**Countermeasure:** Vercel WAF rate-limit rules on `/api/media` and `/api/*`; snap `w` to an allowlist (320/640/960/1280) so the CDN absorbs most variance.

**Verified OK (no action):** service-role key not in client bundle; no secrets committed (only `.env.example` placeholders); **PostgREST filter injection defended** — `_db.js:243-244` escapes `%`/`_` and supabase-js URL-encodes filter expressions; API error handlers return generic messages (no stack traces).

### 3B. Database & Querying / Egress

**E1 — Cover-media fetch unbounded (MED).** `api/_db.js:144-150` (✓ verified: 82 rows/page)
`fetchCoverMediaMap` pulls every media row for all 12 flats (incl. long `public_url`s) just to choose one cover each.
**Countermeasure:** `DISTINCT ON (flat_id) … ORDER BY flat_id, is_cover DESC, sort_order, created_at` (index-supported by `idx_flat_media_cover`) → 82 rows → 12.

**E2 — List projection over-fetch (MED).** `api/_db.js:16-22` (✓ verified: 1313→479 B, 63%)
`PUBLIC_SELECT` (24 cols incl. `description`, `handler_whatsapp_number`, `handler_name`, deposits, status fields) is used for grid rows that render ~7 fields.
**Countermeasure:** add a narrow `LIST_SELECT` for `fetchProperties`/`fetchPropertiesByIds`; keep full `PUBLIC_SELECT` only for `fetchPropertyByRef` (detail) and `og.js`.

**E3 — Search not debounced (MED).** `src/pages/PropertiesPage.jsx:299` → query key
Each keystroke is a new query key → a full `/api/properties` request; each permutation is also a unique CDN URL (low hit rate).
**Countermeasure:** 300–400 ms debounce before `search` enters `serverFilters`/the query key.

**Other egress items (LOW–MED):** cap `fetchPropertiesByIds` ids (`_db.js:272`, e.g. `.slice(0,50)`) and `localities` (`_db.js:237`); push budget + `bhk>=4` filtering server-side (currently client-discarded at `PropertiesPage.jsx:177-185`); fix detail-prefetch width mismatch (`PropertyDetailPage.jsx:111` prefetches no-`w` original but renders `w=1200` → double download); skip the redundant unfiltered `['properties']` fetch on filtered loads (`publicPropertiesContext.jsx:26`).

**Explicitly NOT worth doing now:** installing `pg_trgm` / adding search indexes (32 ms over 222 rows — premature); adding more indexes (already over-indexed). Revisit at ~10–50× catalog growth.

### 3C. Vercel / Serverless Config

**C1 — SPA catch-all rewrite deleted (HIGH).** `vercel.json` (✓ verified via `git diff`)
The working tree removed `{ "source": "/(.*)", "destination": "/index.html" }`, leaving only the `/og/:shareCode` rewrite. With `framework: vite`, Vercel *may* still auto-fallback to `index.html`, so this is a **regression risk that must be tested on a preview deploy** — a hard refresh on `/property/abc`, `/liked`, `/account` could 404.
**Countermeasure:** re-add the catch-all as the **last** rewrite (after `/og/...`); API routes under `/api/*` are matched before rewrites and are unaffected. Verify on a preview URL.

**C2 — Functions not pinned to Mumbai (HIGH/Perf).** `vercel.json` (✓ verified: no `regions`)
DB + storage are in `ap-south-1`. Functions defaulting to US add a ~200–250 ms each-way round trip to every DB/storage call (`og.js` makes up to 3 queries).
**Countermeasure:** add `"regions": ["bom1"]`. (Single-region pinning needs Pro/Enterprise; confirm plan.) Highest-latency-impact fix.

**C3 — `rent-bounds.js` per-request client (MED).** `api/rent-bounds.js:21-25`
Does a dynamic `import` + `createClient` inside the handler on every locality-filtered call, bypassing the `_db.js` singleton.
**Countermeasure:** add a `fetchRentBoundsForLocalities` helper in `_db.js` reusing the pooled singleton.

**C4 — No HTTP method guards (MED).** all `api/*`
Routes execute DB queries on any method.
**Countermeasure:** `if (req.method !== 'GET') return res.status(405).setHeader('Allow','GET').end();`

**C5 — Schema objects gitignored (MED/Ops).** `.gitignore` ignores `scripts/add-indexes.sql`, `schema.sql`, `data.sql` (✓ verified); `supabase/` has only `config.toml`, no `migrations/`.
The `get_filter_options` RPC and listing indexes live only in an untracked file — a fresh environment silently lacks them → `filter-options` 500s + slow scans.
**Countermeasure:** move `add-indexes.sql` into `supabase/migrations/` (tracked, `supabase db push`/CI), or at minimum un-ignore it.

**Other config items:** `media.js` 404 path sets no `Cache-Control` → add `public, s-maxage=60` negative cache; single 484 KB JS bundle (no route-level `React.lazy`/`manualChunks`); `og.js` caches the *generic* fallback for 24 h on any DB hiccup (shorten `s-maxage` or only long-cache on success); `dev` script reverted to plain `vite` (won't serve `/api/*` locally — use `dev:vercel`); `.env.example` bucket says `property-photos` but code uses `property-media`.

### 3D. Frontend / Auth / Routing

**A1 — Client-side role checks are trust-only (HIGH).** `src/app/App.jsx:16-50`, `authService.jsx:125-134,291-297`
`ProtectedRoute` gates on `profile.role`, and the browser **writes** `role`/`is_active` (even self-heals `role:'partner'`). This is safe **only if** Supabase RLS strictly ties rows to `auth.uid()` and forbids client-set trust columns. **No RLS policies are in the repo** (can't verify from code).
**Countermeasure:** confirm + commit RLS on `profiles`, `partner_profiles`, `user_liked_properties`, `visit_requests`, `user_preferences`, `urgent_help_requests`, `property_share_links` with `USING/WITH CHECK (… = auth.uid())`; move profile creation to a DB trigger / `SECURITY DEFINER` RPC so the client never sets `role`/`verification_status`. Run Supabase **security advisors**. Treat all client guards as cosmetic.

**A2 — No 404 route (MED).** `App.jsx:58-99` — unknown URLs render blank chrome.
**Countermeasure:** add `<Route path="*" element={<NotFound />} />`.

**A3 — Share links use `window.location.origin` (MED/Domain).** `PropertyDetailPage.jsx:121,161`
Inconsistent with `visitRequestsService.js:17` which uses `VITE_PUBLIC_SITE_URL`. On previews/old domain, shared links embed the wrong origin.
**Countermeasure:** use `VITE_PUBLIC_SITE_URL` (with `window.location.origin` fallback) everywhere; consolidate the two hardcoded WhatsApp numbers (`919156005618` vs `+919156005618`).

**A4 — `logout()` doesn't clear React Query cache (MED).** `authService.jsx:315-345`
Queries keyed by user id linger for `gcTime` (10 min); a second account on the same tab can flash stale data.
**Countermeasure:** `queryClient.clear()` in `logout()` and on `SIGNED_OUT`.

**Other frontend items:** explicit Supabase auth storage config + rely on `signOut()` rather than manual `localStorage` purge (`supabaseClient.js:7`, `authService.jsx:337`); keep `loading:true` until profile resolves (`authService.jsx:190`); add a top-level **error boundary** (none exist); inconsistent API response shapes (`{items,…}` vs bare array) from `/api/properties`; `SavePropertyButton` doesn't invalidate `['saved-properties']`; a11y gaps on modals/drawer (no `role="dialog"`, focus trap, Escape) and form error `aria-describedby`.

---

## 4. Integration Plan — Vercel + R2 + Domain + Supabase

Four workstreams. Each can ship independently; ordering in §5.

### 4A. Domain — `mydenner.com` (Hostinger → Vercel)

**Current:** `VITE_PUBLIC_SITE_URL = https://denner-web-app.vercel.app`. Code is largely domain-agnostic (`og.js:115` falls back to request host), so this is mostly DNS + one env var — **except** `PropertyDetailPage` share links use `window.location.origin` (A3).

**Steps:**
1. **Vercel** → Project → Settings → Domains → add `mydenner.com` + `www.mydenner.com`. Vercel shows the exact DNS records.
2. **Hostinger** hPanel → DNS Zone (keep Hostinger nameservers so email/other records stay):
   | Type | Name | Value |
   |------|------|-------|
   | `A` | `@` | `76.76.21.21` *(use the value Vercel shows)* |
   | `CNAME` | `www` | `cname.vercel-dns.com` |
   Delete any existing Hostinger parking `A @` record first.
   *(Alt: point NS to `ns1/ns2.vercel-dns.com` for full Vercel DNS — only if moving email too.)*
3. **SSL** auto-provisions once DNS resolves. Set `mydenner.com` as **primary** (auto-redirect the other).
4. **Env:** set `VITE_PUBLIC_SITE_URL=https://mydenner.com` in **Vercel (Production)** *and* local `.env`/`.env.local`. ⚠️ `VITE_` vars are **build-time inlined** — you must **redeploy** after changing, or the old URL stays baked in.
5. **Code:** fix A3 (use `VITE_PUBLIC_SITE_URL` in `PropertyDetailPage`); clean up the duplicate/placeholder `VITE_PUBLIC_APP_BASE_URL` (currently both `denner.in` and `yourdomain.com`) — decide if `denner.in`/`ops.denner.in` are still separate live apps.
6. Confirm `public/og-default.png` exists (referenced at `og.js:132`).

**Gotchas:** build-time env inlining (#4); deep-link 404 risk (C1) becomes user-visible on the real domain — fix C1 in the same release.

### 4B. Cloudflare R2 — Media Storage

**Why:** R2 has **$0 egress**, the right lever for image-heavy serving (vs Supabase Storage which bills egress). At 189 listings the $ saving is modest today — this is **future-proofing + speed**, and it also neutralizes S3 (object-enumeration) if R2 is fronted correctly.

**Clarification:** moving the bucket reduces **Storage** egress, not DB egress. The two are independent bills.

**Two target architectures:**

- **Option A — R2 as origin behind the existing Vercel proxy (low risk).** Swap `media.js:22-23` to fetch from R2 instead of Supabase Storage (R2 is S3-compatible; use a binding or signed GET). Keep Sharp + Vercel CDN.
  - ✅ Storage egress → $0; minimal code change.
  - ❌ No speed gain (still through the Vercel function + Vercel CDN); still pay Vercel compute on cache miss.
- **Option B — R2 + Cloudflare CDN, bypass Vercel for media (the real win).** Serve from R2 via a custom domain (e.g. `img.mydenner.com`) on Cloudflare's edge; resize via **Cloudflare Image Resizing** or a Worker instead of Sharp.
  - ✅ $0 egress **and** edge-served (faster); removes the Vercel function from the image hot path (no cold starts, no Vercel compute for images).
  - ❌ More work: custom domain, replace Sharp, rewrite `MediaAsset.jsx` URL building.

**Migration steps (either option):**
1. Create R2 bucket; configure CORS + (Option B) a custom domain `img.mydenner.com`.
2. One-time copy of the 221 objects: `rclone sync` or `aws s3 sync --endpoint-url <r2>` from Supabase Storage → R2 (keep the same `storage_path` keys so DB rows need no change, or update `public_url`/`storage_path`).
3. Repoint **reads**: Option A → `media.js` origin; Option B → `MediaAsset.jsx` builds `https://img.mydenner.com/<path>?width=…` (Cloudflare resizing params).
4. **Repoint writes** — *the real effort.* Whatever uploads media today (bot/partner pipeline, likely **not in this repo** — see project memory) must write to R2. Until then, dual-write or migrate-then-cutover.
5. Update CSP `img-src` (S2) to include the R2/image domain.

**Gotchas:** the **write/upload path** is the hard part, not reads; Supabase image transformations (if used) must be replaced by Cloudflare resizing; decide public vs signed access (signed closes S3).

### 4C. Supabase — Database, Storage, Auth

**Keep Supabase for Postgres + Auth.** Storage may move to R2 (§4B).

**Actions:**
1. **RLS (critical, A1):** enable + commit policies on all user-writable tables; move `role`/`verification_status` out of client control (trigger / `SECURITY DEFINER` RPC). Run security advisors.
2. **Schema in version control (C5):** move `add-indexes.sql` (indexes + `get_filter_options` RPC) into `supabase/migrations/`.
3. **Query/egress (E1, E2):** `DISTINCT ON` cover RPC; narrow `LIST_SELECT`.
4. **Add a cover RPC** that returns listing + one cover + active share_code per flat in one round trip (collapses the 3-query list path).
5. **Connectivity for tooling:** use the `aws-1-ap-south-1` pooler from IPv4 (documented in memory).
6. **Don't** install `pg_trgm` / add indexes yet (premature at this scale).

### 4D. Vercel — Hosting & Functions

1. **C1** re-add SPA fallback; **C2** `"regions": ["bom1"]`; **S2** global security headers — all in `vercel.json`, ship together.
2. **Functions block:** `"functions": { "api/media.js": { "memory": 1024, "maxDuration": 30 } }`; enable **Fluid Compute** to amortize Sharp cold starts (moot if Option B removes Sharp).
3. **C4** method guards; **C3** shared client in `rent-bounds.js`; **S4** Sharp/fetch limits; **S5** WAF rate limits on `/api/*`.
4. **Bundle:** route-level `React.lazy` + `manualChunks` to cut the 484 KB initial JS.
5. Document `dev:vercel` as the dev command (plain `vite` won't serve `/api/*`).

---

## 5. Consolidated Remediation Roadmap

**Phase 0 — Security & correctness (do first; mostly hours, no infra):**
- S1 XSS fix (`shareCode` allow-list + drop inline script) · S2 security headers · C1 SPA fallback · A1 **verify/commit RLS** (blocker for any data-sensitivity assumption) · S3/S4 media path + Sharp limits.

**Phase 1 — Domain cutover (`mydenner.com`):**
- 4A steps 1–6 · A3 share-link fix · ship C1+C2+S2 in the same deploy · redeploy for build-time env.

**Phase 2 — Egress & latency wins (cheap, high-leverage):**
- C2 `bom1` · E1 cover `DISTINCT ON` · E2 `LIST_SELECT` · E3 search debounce · C3/C4 · S5 rate limits · negative-cache 404s.

**Phase 3 — R2 media migration:**
- Decide Option A vs B (recommend B as target, A as stepping stone) · find + repoint the upload path · migrate 221 objects · update CSP · cut over reads.

**Phase 4 — Hardening & polish:**
- C5 migrations in VCS · error boundary · logout cache clear (A4) · auth storage/loading fixes · 404 route (A2) · bundle splitting · a11y on modals/forms.

**Effort/impact snapshot:**

| Phase | Effort | Primary payoff |
|-------|--------|----------------|
| 0 | ~0.5–1 day | Closes XSS, clickjacking, deep-link breakage, authz gap |
| 1 | ~0.5 day + DNS wait | Live on `mydenner.com`, correct share/OG URLs |
| 2 | ~1 day | Lower latency (Mumbai), ~85% fewer cover rows, 63% smaller list rows, fewer search requests |
| 3 | ~2–4 days | $0 media egress, edge-served images (real cost/speed win at scale) |
| 4 | ~1–2 days | Operational safety, UX/a11y, smaller bundle |

---

## 6. Appendix

**Verified DB connection (IPv4 pooler):** host `aws-1-ap-south-1.pooler.supabase.com`, port `5432` (session), user `postgres.hmfjpgytbwpllekwhkpi`, sslmode `require`. Direct host is IPv6-only.

**Key files:**
`vercel.json` · `vite.config.js` · `api/_db.js` · `api/media.js` · `api/og.js` · `api/rent-bounds.js` · `api/properties.js` · `api/property.js` · `api/filter-options.js` · `scripts/add-indexes.sql` · `src/app/App.jsx` · `src/services/authService.jsx` · `src/pages/PropertyDetailPage.jsx` · `src/pages/PropertiesPage.jsx` · `src/services/publicPropertiesService.js` · `src/services/publicPropertiesContext.jsx` · `src/components/MediaAsset.jsx` · `src/lib/supabaseClient.js` · `src/main.jsx`

**Open questions to resolve before Phase 3:**
1. Where does media get **uploaded** today (the write path)? Likely the bot/partner pipeline outside this repo.
2. Are `denner.in` / `ops.denner.in` still live separate apps, or legacy?
3. Confirm current **RLS** state (run security advisors) — determines whether A1 is already mitigated.
4. Vercel plan tier (single-region pinning + WAF need Pro/Enterprise).

---
*Generated from a multi-agent code audit + live database validation. Findings marked ✓ verified were confirmed directly against the production DB or git diff; (source) findings are from source-code audit and should be spot-checked before acting where noted.*

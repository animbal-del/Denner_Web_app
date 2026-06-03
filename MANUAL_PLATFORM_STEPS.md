# Manual Platform Steps — Denner (Web + Ops) Integration

External-dashboard steps you do by hand (Supabase, Vercel ×2, Hostinger, Cloudflare). All code is on branches: web = `integration-phase0`, ops = `integration-r2`. Nothing here is applied automatically.

Do the sections roughly in order: **A** (database) → **B/C** (web domain) → **D/E** (R2 media, later).

> Legend: 🟢 safe/reversible · 🟡 causes a deploy or DNS change · 🔴 security-sensitive.

---

## A. Supabase — apply the two SQL migrations

Two SQL files were generated in `supabase/migrations/`. **Schema names and the unique index were verified live on 2026-06-02 — safe to apply.** Apply **File 1 first, then File 2**. Both are idempotent (safe to re-run). The full SQL text is reproduced in **Appendix 1** so you can hand it to whoever runs it.

### A1. 🔴 File 1 — `20260602120000_rls_policies.sql` (security hardening)
**What it does:**
- Re-asserts RLS on all user tables.
- **Revokes UPDATE** on the trust columns `profiles.role`, `profiles.is_active`, `partner_profiles.verification_status` from `anon`/`authenticated` → no client can escalate them.
- Revokes blanket write grants from `anon` (defense-in-depth; keeps anon SELECT and anon urgent-help INSERT).
- Adds a `SECURITY DEFINER` trigger `handle_new_user()` on `auth.users` that creates the profile on signup, with **role taken from signup metadata but clamped to {`user`,`partner`}** — `partner` self-registration works; **`admin` can never be self-assigned**.

**Apply:** Supabase Dashboard → **SQL Editor → New query** → paste the file (Appendix 1, File 1) → **Run**. No errors expected.

**Verify:**
```sql
-- trigger exists
select tgname from pg_trigger where tgname = 'on_auth_user_created';
-- trust-column UPDATE grant is gone for authenticated (expect 0 rows)
select * from information_schema.column_privileges
where table_name='profiles' and column_name='role'
  and grantee in ('anon','authenticated') and privilege_type='UPDATE';
-- RLS on
select relname, relrowsecurity from pg_class
where relname in ('profiles','partner_profiles','visit_requests','urgent_help_requests','property_share_links');
```

### A2. 🟢 File 2 — `20260602120000_indexes_and_rpc.sql` (indexes + RPC, version-control)
Version-controls the `get_filter_options()` RPC and the listing indexes (previously only in the gitignored `scripts/add-indexes.sql`). Most objects already exist; the file is `CREATE … IF NOT EXISTS` / `CREATE OR REPLACE`, so running it is a safe no-op where they're present. **Apply:** SQL Editor → paste (Appendix 1, File 2) → **Run**.

### A3. 🔴 Run the Security Advisors
Dashboard → **Advisors → Security** (and **Performance**). Confirm no "RLS disabled" / "anon can write" warnings on user tables. This is the authoritative check that A1 worked.

### A4. 🟢 Smoke-test signup (after the web app is deployed with the branch)
- Sign up a **renter** → profile `role='user'`, can reach `/account`.
- Sign up a **partner** → profile `role='partner'` (trigger honored metadata), reaches `/partner-area`; `partner_profiles.verification_status='pending_review'`.
- Confirm a normal logged-in user **cannot** change their own `role` (any client UPDATE touching `role` should fail with "permission denied for column role").

### A5. 🟢 Confirm the Storage bucket name
Dashboard → **Storage** → confirm the bucket is `property-media` (the web `.env.example` mistakenly says `property-photos`). If different, set `VITE_SUPABASE_STORAGE_BUCKET` in both Vercel projects.

> **Partner verification (optional, not blocking):** self-registered partners are `pending_review` and can log in / use `/partner-area`, but cannot self-verify. If you want an admin "verify partner" action, it must run via an admin/service-role path (a new ops api route or RPC) — login does not depend on it, so this is a future enhancement, not required now.

---

## B. Vercel — WEB project (`denner-web-phase4`)

### B1. 🟢 Confirm plan tier
Settings → General. Region pinning (`bom1`) and WAF rate-limit rules need **Pro/Enterprise**. On Hobby, `regions` is ignored and WAF custom rules are unavailable.

### B2. 🟡 Environment variables (Production)
| Key | Value | Notes |
|-----|-------|-------|
| `VITE_PUBLIC_SITE_URL` | `https://mydenner.com` | build-time inlined → redeploy after change |
| `VITE_DEFAULT_DENNER_WHATSAPP` | `919156005618` | share/contact number (no `+`) |
| `MEDIA_ORIGIN_BASE` | *(leave UNSET until R2 ready)* | set to `https://img.mydenner.com` in step D to serve images from R2 |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | *(existing)* | service-role server-only |
| `VITE_SUPABASE_STORAGE_BUCKET` | `property-media` | only if bucket differs from default |

### B3. 🟡 Add the domain
Settings → **Domains → Add** `mydenner.com` and `www.mydenner.com`. Vercel shows the exact DNS records (use those in Section C). Set **`mydenner.com` as Primary**.

### B4. 🟢 (Pro+) WAF rate-limit rules
Settings → **Firewall → Rate Limiting**: `/api/media` ~60 req/10s per IP; `/api/*` ~120 req/10s per IP → 429.

### B5. 🟡 Deploy the branch
Merge/deploy `integration-phase0`. Confirm a share link in the UI shows `mydenner.com` (proves `VITE_PUBLIC_SITE_URL` took effect). Hard-refresh `/property/<code>` → must NOT 404 (SPA fallback restored).

---

## C. Hostinger — DNS for mydenner.com

1. 🟡 hPanel → **Domains → mydenner.com → DNS / Nameservers → DNS Records**.
2. 🔴 Delete any existing parking `A @` record and Hostinger `CNAME www`. Leave `MX`/`TXT` (email) alone.
3. 🟡 Add (use the exact values Vercel showed in B3; defaults below):
   | Type | Name | Value | TTL |
   |------|------|-------|-----|
   | `A` | `@` | `76.76.21.21` | Auto |
   | `CNAME` | `www` | `cname.vercel-dns.com` | Auto |
4. 🟢 Verify: `nslookup mydenner.com` resolves to Vercel; Domains panel flips to **Valid Configuration**; SSL auto-issues.

---

## D. Cloudflare R2 — media storage (do AFTER domain is live)

Web reads already support R2 via `MEDIA_ORIGIN_BASE`; ops uploads support R2 via a presigned-PUT api route (`api/r2-media.js`) behind env flags. Both keep the identical `flats/{flatId}/...` key scheme, so migrating with the same keys means no code change.

### D1. 🟢 Create bucket
Cloudflare → **R2 → Create bucket** → `denner-media` (APAC location hint).

### D2. 🔴 Create R2 API token
R2 → **Manage R2 API Tokens → Create** → Object Read & Write on `denner-media`. Save **Access Key ID**, **Secret**, **Account ID**, endpoint `https://<accountid>.r2.cloudflarestorage.com`.

### D3. 🟢 Migrate existing objects (preserve keys)
`brew install rclone`; configure an S3 remote for Supabase Storage (endpoint `https://hmfjpgytbwpllekwhkpi.supabase.co/storage/v1/s3`, region `ap-south-1`, keys from Supabase → Settings → Storage → S3 Access Keys) and one for R2 (D2 creds). Then:
```
rclone sync supabase:property-media r2:denner-media --progress --dry-run
rclone sync supabase:property-media r2:denner-media --progress
rclone size r2:denner-media   # expect ~221 objects
```

### D4. 🟡 Public custom domain + CORS
- R2 → `denner-media` → **Settings → Public Access → Connect custom domain** → `img.mydenner.com`.
- **Settings → CORS Policy** (so the browser PUT from ops works):
```json
[{ "AllowedOrigins": ["https://<your-ops-vercel-domain>"], "AllowedMethods": ["PUT","GET"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600 }]
```

### D5. 🟡 Flip WEB reads to R2
In the **web** Vercel project set `MEDIA_ORIGIN_BASE = https://img.mydenner.com` → **redeploy**. `/api/media` now pulls originals from R2 (egress $0). CSP already pre-authorizes `https://img.mydenner.com`.

---

## E. Vercel — OPS project (`denner-ops-phase1-react`): turn on R2 uploads

The ops branch adds `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (installed automatically on deploy) and `api/r2-media.js` (admin-gated presign/delete).

### E1. 🟡 Environment variables (ops project, Production)
**Server-side (no `VITE_` prefix — never sent to browser):**
| Key | Value |
|-----|-------|
| `R2_ACCOUNT_ID` | Cloudflare account id |
| `R2_BUCKET` | `denner-media` |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | from D2 |
| `R2_PUBLIC_BASE` | `https://img.mydenner.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | *(existing)* — verifies the admin token |
| `VITE_SUPABASE_URL` | *(existing)* |

**Client-side (`VITE_`, build-time — flips upload target):**
| Key | Value |
|-----|-------|
| `VITE_MEDIA_UPLOAD_TARGET` | `r2` |
| `VITE_R2_PUBLIC_BASE` | `https://img.mydenner.com` |

> Leave `VITE_MEDIA_UPLOAD_TARGET` unset to keep uploading to Supabase. Redeploy after changing (VITE vars are build-time).

### E2. 🟡 Deploy the ops branch, then verify
Upload a property photo in ops → Network tab shows `POST /api/r2-media` (presign) then a `PUT` to `…r2.cloudflarestorage.com`. New `inventory_flat_media.public_url` = `https://img.mydenner.com/flats/{flatId}/images/{file}`. Open that property on the web app → image loads.

---

## F. Final verification checklist
- [ ] `mydenner.com` loads; `www` → apex; SSL valid.
- [ ] Hard-refresh on `/property/<code>` does NOT 404; unknown URL shows the 404 page.
- [ ] Share link contains `mydenner.com`; `/og/<code>` renders a rich social preview; `/og/<script>` returns 400.
- [ ] Response headers include `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`.
- [ ] Renter signup → `role=user`; partner signup → `role=partner` + `/partner-area`; user cannot change own `role`.
- [ ] Supabase Security Advisors: no RLS/anon-write gaps.
- [ ] (After D/E) ops upload writes to R2; web images load from R2.
- [ ] Log in as one account, log out, log in as another in the same tab → no stale data.

---

## Appendix 1 — SQL to run (hand this to whoever applies it)

Run **File 1, then File 2** in the Supabase SQL Editor. Both are idempotent. The canonical source is `supabase/migrations/20260602120000_rls_policies.sql` and `…_indexes_and_rpc.sql` in the repo — copy their full contents from there (do not retype). Apply order and intent:

1. **`20260602120000_rls_policies.sql`** — RLS + trust-column UPDATE revokes + `handle_new_user()` trigger (role clamped to user/partner, admin never self-assignable). Verified against live schema 2026-06-02.
2. **`20260602120000_indexes_and_rpc.sql`** — `get_filter_options()` RPC + listing indexes (mostly already present; safe no-op where they exist).

After running, do A3 (Security Advisors) and A4 (signup smoke-test).

---
*Web branch `integration-phase0`, ops branch `integration-r2`. Nothing is applied/committed until you do it. SQL verified live; DNS/Cloudflare/env steps are manual.*

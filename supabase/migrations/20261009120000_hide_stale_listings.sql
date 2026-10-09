-- Hide stale listings from the website
--
-- The website only shows flats that were edited (saved) in the last 2 months.
-- Older flats stay untouched in the ops tool (which reads inventory_flats
-- directly) and show an "Off website" tag there. Saving a flat in the ops Edit
-- form bumps updated_at, which puts it back on the website for 2 more months.
--
-- Every website read (listing grid, detail page, share links, sitemap, filter
-- options RPC) goes through public_listings, so this one view change covers
-- them all. Shared links to a hidden flat show "not found" until it is edited.
--
-- Impact at time of writing (2026-10-09): 470 live+available flats, 326 of
-- them not edited since 2026-08-09, leaving ~144 on the website.
--
-- Run order: this file, THEN deploy ops (for the "Off website" tag).

-- PRE-CHECK 1: the view must still match the definition below (the one from
-- 20261002120000_add_zero_brokerage.sql). Run:
--   SELECT pg_get_viewdef('public.public_listings'::regclass, true);
-- If its column list differs, update the SELECT below to match before running.
--
-- PRE-CHECK 2: CREATE OR REPLACE VIEW resets view options. Run:
--   SELECT reloptions FROM pg_class WHERE oid = 'public.public_listings'::regclass;
-- If it returns NULL, run as-is. If it returns e.g. {security_invoker=true},
-- add `WITH (security_invoker = true)` after `public.public_listings` below.
CREATE OR REPLACE VIEW public.public_listings AS
SELECT id,
    flat_code,
    slug,
    title,
    description,
    society_name,
    property_type,
    bhk,
    furnishing_status,
    tenant_type,
    occupancy_for,
    monthly_rent,
    deposit,
    maintenance,
    sq_ft,
    floor_number,
    bathrooms,
    balconies,
    available_from,
    city,
    locality,
    sub_locality,
    listing_status,
    business_status,
    visibility_status,
    is_verified,
    is_featured,
    published_at,
    cover_image_url,
    handler_whatsapp_number,
    handler_name,
    updated_at,
    no_brokerage,
    is_zero_brokerage
   FROM inventory_flats
  WHERE listing_status = 'live'::listing_status
    AND business_status = 'available'::business_status
    AND updated_at >= now() - interval '2 months';

-- Make the API pick up the change immediately.
NOTIFY pgrst, 'reload schema';

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Should be roughly 144 (it drops a little each day as flats age out):
--   SELECT count(*) FROM public.public_listings;
--
-- ── Rollback ────────────────────────────────────────────────────────────────
-- Re-run the CREATE OR REPLACE VIEW above without the `updated_at` line.

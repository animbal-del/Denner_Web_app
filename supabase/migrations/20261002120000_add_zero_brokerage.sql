-- Zero Brokerage flag
--
-- Ops ticks "Zero brokerage" when listing a flat; the website shows a corner
-- ribbon on the card, a tag on the detail page, and a "Zero Brokerage only"
-- filter on /properties.
--
-- A dedicated boolean is used instead of `brokerage = 0` because ops defaults
-- brokerage to 0 on every intake, so that would badge almost every flat.
--
-- Run order: this file, THEN deploy web, THEN deploy ops.

-- ── 1. Column on the base table ─────────────────────────────────────────────
-- Default false so every existing flat is unchanged. The ops app writes it via
-- the existing table-level grant to `authenticated`; no column grant needed.
ALTER TABLE public.inventory_flats
  ADD COLUMN IF NOT EXISTS is_zero_brokerage boolean NOT NULL DEFAULT false;

-- Supports the website "Zero Brokerage only" filter. Partial, so it stays tiny.
CREATE INDEX IF NOT EXISTS idx_inventory_flats_zero_brokerage
  ON public.inventory_flats(updated_at DESC)
  WHERE is_zero_brokerage;

-- ── 2. Expose it through the public_listings view ───────────────────────────
-- Postgres freezes a view's column list at creation time (even `SELECT *`),
-- so the website cannot see the new column until the view is redefined.
--
-- Definition below is the live one (pg_get_viewdef, 2026-10-02) with
-- is_zero_brokerage appended. CREATE OR REPLACE VIEW only allows appending
-- columns at the end, so the existing order is kept exactly.
--
-- Note: the legacy `no_brokerage` column is NOT used for this feature. It is
-- unreferenced by either app and is true on ~half of all flats (254/526), so
-- badging off it would mark flats nobody chose.
--
-- PRE-CHECK: CREATE OR REPLACE VIEW resets view options. Run first:
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
  WHERE listing_status = 'live'::listing_status AND business_status = 'available'::business_status;

-- Make the API pick up the new view column immediately.
NOTIFY pgrst, 'reload schema';

-- ── 3. Verify ───────────────────────────────────────────────────────────────
-- SELECT id, society_name, is_zero_brokerage FROM public.public_listings LIMIT 5;

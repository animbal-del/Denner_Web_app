-- ============================================================================
-- INDEXES + get_filter_options RPC
--
-- This migration MIRRORS the contents of scripts/add-indexes.sql so that the
-- indexes and the get_filter_options() RPC are version-controlled in the
-- supabase/migrations history (addresses the gitignored-schema drift problem:
-- the live DB had these objects but they were never tracked as a migration).
--
-- Keep this file in sync with scripts/add-indexes.sql. All statements are
-- idempotent (CREATE OR REPLACE / CREATE INDEX IF NOT EXISTS), so re-running is
-- safe. REVIEW before applying — verify index/column names against your schema.
-- ============================================================================

-- Run this in the Supabase SQL Editor (dashboard → SQL Editor → New query).
-- Safe to re-run: all statements use CREATE OR REPLACE / IF NOT EXISTS.
--
-- Already existing indexes (skipped to avoid duplicates):
--   idx_flat_media_cover, idx_inventory_flat_media_flat_id
--   idx_profiles_auth_user_id, idx_partner_profiles_profile_id
--   idx_share_links_code, idx_property_share_links_flat
--   idx_user_liked_properties_user + unique (user_profile_id, flat_id)
--   idx_visit_requests_user, idx_visit_requests_flat

-- ── get_filter_options RPC ────────────────────────────────────
-- Returns all distinct filter values in one round-trip.
-- Querying public_listings (the view) is fine here — only CREATE INDEX
-- requires the base table (inventory_flats).

CREATE OR REPLACE FUNCTION get_filter_options()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'cities',
      (SELECT COALESCE(json_agg(v ORDER BY v), '[]'::json)
       FROM (SELECT DISTINCT city AS v FROM public_listings WHERE city IS NOT NULL AND city <> '') t),
    'localities',
      (SELECT COALESCE(json_agg(v ORDER BY v), '[]'::json)
       FROM (SELECT DISTINCT locality AS v FROM public_listings WHERE locality IS NOT NULL AND locality <> '') t),
    'propertyTypes',
      (SELECT COALESCE(json_agg(v ORDER BY v), '[]'::json)
       FROM (SELECT DISTINCT property_type AS v FROM public_listings WHERE property_type IS NOT NULL AND property_type <> '') t),
    'furnishingStatuses',
      (SELECT COALESCE(json_agg(v ORDER BY v), '[]'::json)
       FROM (SELECT DISTINCT furnishing_status AS v FROM public_listings WHERE furnishing_status IS NOT NULL AND furnishing_status <> '') t),
    'minRent',
      (SELECT MIN(monthly_rent) FROM public_listings WHERE monthly_rent IS NOT NULL AND monthly_rent > 0),
    'maxRent',
      (SELECT MAX(monthly_rent) FROM public_listings WHERE monthly_rent IS NOT NULL AND monthly_rent > 0)
  );
$$;

GRANT EXECUTE ON FUNCTION get_filter_options() TO anon, authenticated;

-- ── inventory_flats (base table for public_listings view) ─────
-- idx_inventory_flats_city_locality and idx_flats_listing_status
-- already exist from the original schema.

CREATE INDEX IF NOT EXISTS idx_flats_updated_at
  ON inventory_flats(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_flats_locality_updated
  ON inventory_flats(locality, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_flats_city_updated
  ON inventory_flats(city, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_flats_rent
  ON inventory_flats(monthly_rent ASC)
  WHERE monthly_rent IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_flats_property_type
  ON inventory_flats(property_type);

CREATE INDEX IF NOT EXISTS idx_flats_furnishing
  ON inventory_flats(furnishing_status);

-- ── visit_requests ───────────────────────────────────────────
-- idx_visit_requests_user (user_profile_id) already exists.
-- Adding compound (user+flat) and created_at for common query patterns.

CREATE INDEX IF NOT EXISTS idx_visits_user_flat
  ON visit_requests(user_profile_id, flat_id);

CREATE INDEX IF NOT EXISTS idx_visits_created
  ON visit_requests(created_at DESC);

-- ── urgent_help_requests ─────────────────────────────────────
-- Only idx_urgent_help_requests_status exists; user lookup is missing.

CREATE INDEX IF NOT EXISTS idx_urgent_user
  ON urgent_help_requests(user_profile_id);

-- ── user_preferences ─────────────────────────────────────────
-- Column is profile_id (not user_profile_id).

CREATE INDEX IF NOT EXISTS idx_prefs_user
  ON user_preferences(profile_id);

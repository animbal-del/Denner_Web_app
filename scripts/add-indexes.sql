-- Run this in the NEW Supabase project's SQL Editor after importing the schema.
-- These indexes match the exact query patterns used by the app.

-- ── public_listings ───────────────────────────────────────────

-- Main pagination (ordered by newest)
CREATE INDEX IF NOT EXISTS idx_listings_updated_at
  ON public_listings(updated_at DESC);

-- Locality filter + pagination (most frequent filter path)
CREATE INDEX IF NOT EXISTS idx_listings_locality_updated
  ON public_listings(locality, updated_at DESC);

-- City filter + pagination
CREATE INDEX IF NOT EXISTS idx_listings_city_updated
  ON public_listings(city, updated_at DESC);

-- Rent bounds: two limit-1 queries (ascending + descending)
CREATE INDEX IF NOT EXISTS idx_listings_rent
  ON public_listings(monthly_rent ASC)
  WHERE monthly_rent IS NOT NULL;

-- Filter dropdowns
CREATE INDEX IF NOT EXISTS idx_listings_property_type
  ON public_listings(property_type);

CREATE INDEX IF NOT EXISTS idx_listings_furnishing
  ON public_listings(furnishing_status);

-- Share code join on detail page
CREATE INDEX IF NOT EXISTS idx_listings_id
  ON public_listings(id);

-- ── inventory_flat_media ──────────────────────────────────────

-- Cover fetch per page load (flat_id in [...], cover-first order)
CREATE INDEX IF NOT EXISTS idx_media_flat_cover
  ON inventory_flat_media(flat_id, is_cover DESC, sort_order ASC, created_at ASC);

-- Full gallery fetch on detail page
CREATE INDEX IF NOT EXISTS idx_media_flat_gallery
  ON inventory_flat_media(flat_id, sort_order ASC, created_at ASC);

-- ── property_share_links ─────────────────────────────────────

-- Detail page lookup by share code
CREATE INDEX IF NOT EXISTS idx_share_code_active
  ON property_share_links(share_code)
  WHERE is_active = true;

-- Per-page batch flat_id lookup
CREATE INDEX IF NOT EXISTS idx_share_flat_active
  ON property_share_links(flat_id, is_active, created_at DESC);

-- ── profiles ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_profiles_auth_user
  ON profiles(auth_user_id);

-- ── partner_profiles ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_partner_profile_id
  ON partner_profiles(profile_id);

-- ── user_liked_properties ────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_liked_user
  ON user_liked_properties(user_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_liked_user_flat
  ON user_liked_properties(user_profile_id, flat_id);

-- ── visit_requests ───────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_visits_user_flat
  ON visit_requests(user_profile_id, flat_id);

CREATE INDEX IF NOT EXISTS idx_visits_created
  ON visit_requests(created_at DESC);

-- ── urgent_help_requests ─────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_urgent_user
  ON urgent_help_requests(user_profile_id);

-- ── user_preferences ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_prefs_user
  ON user_preferences(user_profile_id);

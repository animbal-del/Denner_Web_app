-- ============================================================================
-- Instagram automation: post queue, settings, music and credentials
-- ----------------------------------------------------------------------------
-- Adds the tables behind the Instagram module in Denner Ops (queue, previews,
-- approvals, pause, music, publishing log). Code lives in the ops repo under
-- social/ (branch feature/instagram-automation).
--
-- Additive only. No existing table, view, policy or grant is changed:
--   * inventory_flats and public_listings are read, never altered. Which flats
--     can be posted is decided in code from public_listings (the website rule).
--   * Deleting a flat in ops keeps working: social_flat_settings rows cascade,
--     social_post_jobs keep their history with flat_id set to NULL (flat_code
--     stays, it never changes).
--
-- Access:
--   * Admins (is_admin()) can READ every social table except credentials.
--   * All writes go through server code with the service-role key (ops api/
--     functions and the VPS worker), which enforces the job state machine.
--   * anon has no access to anything here.
--   * social_credentials holds AES-256-GCM encrypted tokens and is readable by
--     service_role only. Admins see connection status (never the token) via
--     social_connection_status().
--
-- Grants are explicit because from 2026-10-30 Supabase no longer auto-grants
-- Data API access to new public tables. REVOKE first so the result is the same
-- whether or not the old auto-grants applied.
--
-- PRE-CHECK 1: the helper used by the policies exists:
--   SELECT 'public.is_admin()'::regprocedure;
-- PRE-CHECK 2: the referenced keys are still bigint:
--   SELECT table_name, column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND (table_name, column_name) IN (('inventory_flats','id'), ('profiles','id'));
-- PRE-CHECK 3: gen_random_uuid() is available (pgcrypto / PG13+):
--   SELECT gen_random_uuid();
--
-- Run the whole file at once in the Supabase SQL editor. If any statement
-- fails, nothing is changed.
-- ============================================================================

BEGIN;

-- ── 0. updated_at helper (social tables only) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.social_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ── 1. Settings (one row) ───────────────────────────────────────────────────
-- dry_run and require_approval start ON. publish_account starts on the test
-- account; switching to production is a deliberate settings change.
CREATE TABLE IF NOT EXISTS public.social_settings (
  id                    smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  paused                boolean  NOT NULL DEFAULT false,
  dry_run               boolean  NOT NULL DEFAULT true,
  require_approval      boolean  NOT NULL DEFAULT true,
  publish_account       text     NOT NULL DEFAULT 'test' CHECK (publish_account IN ('test', 'production')),
  timezone              text     NOT NULL DEFAULT 'Asia/Kolkata',
  carousel_enabled      boolean  NOT NULL DEFAULT true,
  reel_enabled          boolean  NOT NULL DEFAULT true,
  -- Daily posting slots: how many posts a day, at what local time, which
  -- format. The carousel/Reel mix is the mix of slots.
  schedule_slots        jsonb    NOT NULL DEFAULT '[{"time":"11:00","format":"reel"},{"time":"19:30","format":"carousel"}]'
                          CHECK (jsonb_typeof(schedule_slots) = 'array' AND jsonb_array_length(schedule_slots) <= 6),
  active_weekdays       smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7]::smallint[]
                          CHECK (active_weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[]),
  blackout_dates        date[]   NOT NULL DEFAULT '{}',
  queue_days_ahead      smallint NOT NULL DEFAULT 3 CHECK (queue_days_ahead BETWEEN 1 AND 14),
  repost_cooldown_days  smallint NOT NULL DEFAULT 30 CHECK (repost_cooldown_days >= 1),
  -- Any website flat with one usable photo can be posted.
  min_carousel_photos   smallint NOT NULL DEFAULT 1 CHECK (min_carousel_photos >= 1),
  min_reel_photos       smallint NOT NULL DEFAULT 1 CHECK (min_reel_photos >= 1),
  max_carousel_slides   smallint NOT NULL DEFAULT 8 CHECK (max_carousel_slides BETWEEN 1 AND 8),
  max_reel_photos       smallint NOT NULL DEFAULT 8 CHECK (max_reel_photos BETWEEN 1 AND 12),
  priority_localities   text[]   NOT NULL DEFAULT ARRAY['Kharadi', 'Viman Nagar', 'Kalyani Nagar', 'Koregaon Park'],
  -- Rendering
  carousel_template     text     NOT NULL DEFAULT 'classic' CHECK (carousel_template IN ('classic', 'noir')),
  reel_template         text     NOT NULL DEFAULT 'classic' CHECK (reel_template IN ('classic', 'noir')),
  reel_target_seconds   smallint NOT NULL DEFAULT 15 CHECK (reel_target_seconds BETWEEN 8 AND 30),
  prefer_unstamped_photos boolean NOT NULL DEFAULT true,
  render_window         jsonb    NOT NULL DEFAULT '{"start":"00:30","end":"08:00"}',
  cta_phone_line        text     NOT NULL DEFAULT '📞 Call: 9518974818 / 7020738841',
  link_base             text     NOT NULL DEFAULT 'https://mydenner.com',
  campaign              text     NOT NULL DEFAULT 'inventory',
  -- Music for Reels comes from Instagram's own licensed library (Audio API),
  -- attached at publish time. Nothing is downloaded or embedded.
  music_enabled         boolean  NOT NULL DEFAULT true,
  music_source          text     NOT NULL DEFAULT 'trending'
                          CHECK (music_source IN ('trending', 'search', 'approved_list')),
  music_search_queries  text[]   NOT NULL DEFAULT '{}',
  audio_volume          smallint NOT NULL DEFAULT 70  CHECK (audio_volume BETWEEN 1 AND 100),
  video_volume          smallint NOT NULL DEFAULT 100 CHECK (video_volume BETWEEN 1 AND 100),
  on_music_unavailable  text     NOT NULL DEFAULT 'hold_for_review'
                          CHECK (on_music_unavailable IN ('use_fallback_track', 'hold_for_review', 'publish_without_music')),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by_profile_id bigint REFERENCES public.profiles(id) ON DELETE SET NULL
);

INSERT INTO public.social_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_social_settings_updated_at ON public.social_settings;
CREATE TRIGGER trg_social_settings_updated_at
  BEFORE UPDATE ON public.social_settings
  FOR EACH ROW EXECUTE FUNCTION public.social_touch_updated_at();

-- ── 2. Per-flat opt-out ─────────────────────────────────────────────────────
-- Kept out of inventory_flats so the website's table and view stay untouched.
CREATE TABLE IF NOT EXISTS public.social_flat_settings (
  flat_id    bigint PRIMARY KEY REFERENCES public.inventory_flats(id) ON DELETE CASCADE,
  opt_out    boolean NOT NULL DEFAULT false,
  notes      text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_profile_id bigint REFERENCES public.profiles(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS trg_social_flat_settings_updated_at ON public.social_flat_settings;
CREATE TRIGGER trg_social_flat_settings_updated_at
  BEFORE UPDATE ON public.social_flat_settings
  FOR EACH ROW EXECUTE FUNCTION public.social_touch_updated_at();

-- ── 3. Instagram audio catalogue ────────────────────────────────────────────
-- Tracks seen through the Instagram Audio API (GET /ig_audio). Only metadata
-- and Instagram's audio_id are stored; the audio itself stays on Instagram.
-- status: candidate (seen), approved (allowed for our Reels), blocked.
CREATE TABLE IF NOT EXISTS public.social_audio_tracks (
  audio_id        text PRIMARY KEY,
  audio_type      text NOT NULL CHECK (audio_type IN ('music', 'original_sound')),
  title           text,
  display_artist  text,
  duration_ms     integer,
  is_ads_eligible boolean,
  cover_url       text,
  preview_link    text,
  source          text NOT NULL CHECK (source IN ('trending', 'search', 'manual')),
  search_query    text,
  status          text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'approved', 'blocked')),
  is_fallback     boolean NOT NULL DEFAULT false,
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz,
  use_count       integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_social_audio_tracks_status
  ON public.social_audio_tracks (status, last_seen_at DESC);

-- ── 4. Post jobs (one row per post) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_post_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flat_id          bigint REFERENCES public.inventory_flats(id) ON DELETE SET NULL,
  flat_code        text NOT NULL,
  format           text NOT NULL CHECK (format IN ('carousel', 'reel')),
  campaign         text NOT NULL DEFAULT 'inventory',
  revision         integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  status           text NOT NULL DEFAULT 'candidate' CHECK (status IN (
                     'candidate', 'validated', 'rendered', 'ready_for_review', 'approved',
                     'scheduled', 'publishing', 'published',
                     'skipped', 'held', 'failed', 'cancelled')),
  status_reason    text,
  score            numeric,
  render_warnings  jsonb,
  dry_run          boolean NOT NULL DEFAULT true,
  -- What the post was built from: allowlisted public fields only.
  source_snapshot  jsonb NOT NULL,
  source_hash      text NOT NULL,
  photo_urls       text[] NOT NULL DEFAULT '{}',
  property_url     text,
  utm_campaign     text,
  utm_content      text,
  caption          jsonb,
  caption_source   text CHECK (caption_source IN ('claude', 'fallback', 'manual')),
  -- Music (Reels only)
  audio_id         text REFERENCES public.social_audio_tracks(audio_id) ON DELETE SET NULL,
  audio_volume     smallint CHECK (audio_volume BETWEEN 1 AND 100),
  video_volume     smallint CHECK (video_volume BETWEEN 1 AND 100),
  audio_status     text NOT NULL DEFAULT 'not_applicable' CHECK (audio_status IN (
                     'not_applicable', 'pending', 'selected', 'unavailable', 'attached', 'none')),
  -- Scheduling, approval, retries
  scheduled_for    timestamptz,
  approved_by_profile_id bigint REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at      timestamptz,
  attempts         smallint NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz,
  last_error       jsonb,
  locked_by        text,
  locked_at        timestamptz,
  -- Instagram results
  ig_account       text CHECK (ig_account IN ('test', 'production')),
  ig_container_id  text,
  ig_media_id      text,
  ig_permalink     text,
  published_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_post_jobs_dedupe UNIQUE (flat_code, format, campaign, revision),
  CONSTRAINT social_post_jobs_snapshot_size CHECK (pg_column_size(source_snapshot) <= 8192)
);

-- At most one in-flight job per flat and format.
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_post_jobs_active
  ON public.social_post_jobs (flat_code, format)
  WHERE status NOT IN ('published', 'skipped', 'cancelled', 'failed');

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_post_jobs_ig_media
  ON public.social_post_jobs (ig_media_id)
  WHERE ig_media_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_post_jobs_queue
  ON public.social_post_jobs (status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_social_post_jobs_flat
  ON public.social_post_jobs (flat_code, created_at DESC);

DROP TRIGGER IF EXISTS trg_social_post_jobs_updated_at ON public.social_post_jobs;
CREATE TRIGGER trg_social_post_jobs_updated_at
  BEFORE UPDATE ON public.social_post_jobs
  FOR EACH ROW EXECUTE FUNCTION public.social_touch_updated_at();

-- ── 5. Rendered files ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_post_assets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES public.social_post_jobs(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('slide', 'video', 'cover')),
  position    smallint NOT NULL DEFAULT 0,
  storage_key text NOT NULL,
  public_url  text NOT NULL,
  sha256      text NOT NULL,
  mime_type   text NOT NULL,
  width       integer,
  height      integer,
  bytes       integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_post_assets_slot UNIQUE (job_id, kind, position)
);

-- ── 6. Audit log of status changes ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_job_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id      uuid NOT NULL REFERENCES public.social_post_jobs(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  actor       text NOT NULL,
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_job_events_job
  ON public.social_job_events (job_id, created_at);

-- ── 7. Credentials (service role only) ──────────────────────────────────────
-- One row per connected account ('test', 'production'). token_ciphertext is
-- AES-256-GCM sealed by the server with SOCIAL_TOKEN_KEY (server env only).
CREATE TABLE IF NOT EXISTS public.social_credentials (
  account          text PRIMARY KEY CHECK (account IN ('test', 'production')),
  login_flow       text NOT NULL DEFAULT 'facebook_login' CHECK (login_flow IN ('facebook_login', 'instagram_login')),
  fb_page_id       text,
  ig_user_id       text,
  ig_username      text,
  token_kind       text CHECK (token_kind IN ('system_user', 'page', 'user_long_lived')),
  token_ciphertext text,
  token_expires_at timestamptz,
  scopes           text[] NOT NULL DEFAULT '{}',
  status           text NOT NULL DEFAULT 'disconnected'
                     CHECK (status IN ('disconnected', 'connected', 'expired', 'revoked', 'error')),
  last_verified_at timestamptz,
  last_error       text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_social_credentials_updated_at ON public.social_credentials;
CREATE TRIGGER trg_social_credentials_updated_at
  BEFORE UPDATE ON public.social_credentials
  FOR EACH ROW EXECUTE FUNCTION public.social_touch_updated_at();

-- Admin-visible connection status. Never returns the token.
CREATE OR REPLACE FUNCTION public.social_connection_status()
RETURNS TABLE (
  account text, login_flow text, ig_username text, fb_page_id text, ig_user_id text,
  token_kind text, token_expires_at timestamptz, scopes text[], status text,
  last_verified_at timestamptz, last_error text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT c.account, c.login_flow, c.ig_username, c.fb_page_id, c.ig_user_id,
           c.token_kind, c.token_expires_at, c.scopes, c.status,
           c.last_verified_at, c.last_error
    FROM public.social_credentials c
    ORDER BY c.account;
END;
$$;

-- ── 8. Row level security ───────────────────────────────────────────────────
ALTER TABLE public.social_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_flat_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_audio_tracks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_assets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_job_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_credentials   ENABLE ROW LEVEL SECURITY;
-- social_credentials gets no policies: only service_role (which bypasses RLS)
-- can touch it.

DROP POLICY IF EXISTS social_settings_admin_read ON public.social_settings;
CREATE POLICY social_settings_admin_read ON public.social_settings
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS social_flat_settings_admin_read ON public.social_flat_settings;
CREATE POLICY social_flat_settings_admin_read ON public.social_flat_settings
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS social_audio_tracks_admin_read ON public.social_audio_tracks;
CREATE POLICY social_audio_tracks_admin_read ON public.social_audio_tracks
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS social_post_jobs_admin_read ON public.social_post_jobs;
CREATE POLICY social_post_jobs_admin_read ON public.social_post_jobs
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS social_post_assets_admin_read ON public.social_post_assets;
CREATE POLICY social_post_assets_admin_read ON public.social_post_assets
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS social_job_events_admin_read ON public.social_job_events;
CREATE POLICY social_job_events_admin_read ON public.social_job_events
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- ── 9. Grants ───────────────────────────────────────────────────────────────
REVOKE ALL ON public.social_settings, public.social_flat_settings, public.social_audio_tracks,
              public.social_post_jobs, public.social_post_assets, public.social_job_events,
              public.social_credentials
  FROM anon, authenticated;

GRANT SELECT ON public.social_settings, public.social_flat_settings, public.social_audio_tracks,
                public.social_post_jobs, public.social_post_assets, public.social_job_events
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_settings, public.social_flat_settings,
              public.social_audio_tracks, public.social_post_jobs, public.social_post_assets,
              public.social_job_events, public.social_credentials
  TO service_role;

REVOKE ALL ON FUNCTION public.social_connection_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_connection_status() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.social_touch_updated_at() FROM PUBLIC, anon, authenticated;

COMMIT;

-- Make the API pick up the new tables immediately.
NOTIFY pgrst, 'reload schema';

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expected: 1 | 0 | 0 | true | true | 'test'
--   SELECT (SELECT count(*) FROM public.social_settings),
--          (SELECT count(*) FROM public.social_post_jobs),
--          (SELECT count(*) FROM public.social_credentials),
--          dry_run, require_approval, publish_account
--   FROM public.social_settings;
--
-- anon must see nothing (run with the anon key, or):
--   SELECT has_table_privilege('anon', 'public.social_post_jobs', 'SELECT');          -- false
--   SELECT has_table_privilege('authenticated', 'public.social_credentials', 'SELECT'); -- false
--   SELECT has_table_privilege('authenticated', 'public.social_post_jobs', 'UPDATE');  -- false
--
-- Website count is unchanged:
--   SELECT count(*) FROM public.public_listings;
--
-- ── Rollback ────────────────────────────────────────────────────────────────
-- Removes everything this file added. Nothing else depends on these objects.
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.social_connection_status();
--   DROP TABLE IF EXISTS public.social_job_events, public.social_post_assets,
--     public.social_post_jobs, public.social_audio_tracks, public.social_flat_settings,
--     public.social_settings, public.social_credentials;
--   DROP FUNCTION IF EXISTS public.social_touch_updated_at();
--   COMMIT;
--   NOTIFY pgrst, 'reload schema';

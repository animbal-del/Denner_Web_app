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
-- PRE-CHECK 4: visit_requests has the attribution column (20260926120000):
--   SELECT 1 FROM information_schema.columns
--   WHERE table_name = 'visit_requests' AND column_name = 'attribution';
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
  -- Initial 28-day experiment: three Reels a day (lunch and evening).
  schedule_slots        jsonb    NOT NULL DEFAULT '[{"time":"12:30","format":"reel"},{"time":"18:30","format":"reel"},{"time":"21:15","format":"reel"}]'
                          CHECK (jsonb_typeof(schedule_slots) = 'array' AND jsonb_array_length(schedule_slots) <= 6),
  active_weekdays       smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7]::smallint[]
                          CHECK (active_weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[]),
  blackout_dates        date[]   NOT NULL DEFAULT '{}',
  queue_days_ahead      smallint NOT NULL DEFAULT 3 CHECK (queue_days_ahead BETWEEN 1 AND 14),
  repost_cooldown_days  smallint NOT NULL DEFAULT 30 CHECK (repost_cooldown_days >= 1),
  min_gap_minutes       smallint NOT NULL DEFAULT 90 CHECK (min_gap_minutes BETWEEN 15 AND 720),
  -- Any website flat with one usable photo can be posted.
  min_carousel_photos   smallint NOT NULL DEFAULT 1 CHECK (min_carousel_photos >= 1),
  min_reel_photos       smallint NOT NULL DEFAULT 1 CHECK (min_reel_photos >= 1),
  max_carousel_slides   smallint NOT NULL DEFAULT 8 CHECK (max_carousel_slides BETWEEN 1 AND 8),
  max_reel_photos       smallint NOT NULL DEFAULT 8 CHECK (max_reel_photos BETWEEN 1 AND 12),
  priority_localities   text[]   NOT NULL DEFAULT ARRAY['Kharadi', 'Viman Nagar', 'Kalyani Nagar', 'Koregaon Park'],
  -- Rendering
  carousel_template     text     NOT NULL DEFAULT 'classic' CHECK (carousel_template IN ('classic', 'noir')),
  reel_template         text     NOT NULL DEFAULT 'classic' CHECK (reel_template IN ('classic', 'noir')),
  reel_target_seconds   smallint NOT NULL DEFAULT 15 CHECK (reel_target_seconds BETWEEN 12 AND 18),
  -- "Next photo in" countdown on Reels (not on the last photo, the end
  -- card or one-photo Reels). Applies to Reels rendered after a change.
  countdown_enabled     boolean  NOT NULL DEFAULT true,
  -- ring_capsule (A: two-line label + ring), ring_badge (B: ring + caption),
  -- pill (C: one-line pill). All count S..0 and vanish as the next photo starts.
  countdown_style       text     NOT NULL DEFAULT 'ring_capsule' CHECK (countdown_style IN ('ring_capsule', 'ring_badge', 'pill')),
  prefer_unstamped_photos boolean NOT NULL DEFAULT true,
  render_window         jsonb    NOT NULL DEFAULT '{"start":"00:30","end":"08:00"}',
  -- Experiment label stamped on every post, so slots can be compared. The
  -- schedule is never changed automatically.
  experiment_name       text     NOT NULL DEFAULT 'slots-28d-1' CHECK (experiment_name ~ '^[a-z0-9-]{3,40}$'),
  experiment_days       smallint NOT NULL DEFAULT 28 CHECK (experiment_days BETWEEN 7 AND 120),
  experiment_start      date,
  cta_phone_line        text     NOT NULL DEFAULT '📞 Call: 9518974818 / 7020738841',
  -- AI captions (OpenAI): hook + hashtags only, standard caption otherwise.
  ai_captions_enabled   boolean  NOT NULL DEFAULT true,
  ai_model              text     NOT NULL DEFAULT 'gpt-5.6-luna' CHECK (ai_model ~ '^[a-z0-9][a-z0-9.\-]{2,60}$'),
  ai_monthly_budget_usd numeric(8,4) NOT NULL DEFAULT 1 CHECK (ai_monthly_budget_usd BETWEEN 0 AND 100),
  ai_price_input_per_mtok  numeric(8,4) NOT NULL DEFAULT 0.25 CHECK (ai_price_input_per_mtok BETWEEN 0 AND 100),
  ai_price_output_per_mtok numeric(8,4) NOT NULL DEFAULT 2 CHECK (ai_price_output_per_mtok BETWEEN 0 AND 100),
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
  render_options   jsonb,
  dry_run          boolean NOT NULL DEFAULT true,
  -- What the post was built from: allowlisted public fields only.
  source_snapshot  jsonb NOT NULL,
  source_hash      text NOT NULL,
  photo_urls       text[] NOT NULL DEFAULT '{}',
  property_url     text,
  utm_campaign     text,
  utm_content      text,
  caption          jsonb,
  caption_source   text CHECK (caption_source IN ('openai', 'fallback', 'manual')),
  -- Music (Reels only)
  audio_id         text REFERENCES public.social_audio_tracks(audio_id) ON DELETE SET NULL,
  audio_volume     smallint CHECK (audio_volume BETWEEN 1 AND 100),
  video_volume     smallint CHECK (video_volume BETWEEN 1 AND 100),
  audio_status     text NOT NULL DEFAULT 'not_applicable' CHECK (audio_status IN (
                     'not_applicable', 'pending', 'selected', 'unavailable', 'attached', 'none')),
  -- Scheduling, approval, retries
  scheduled_for    timestamptz,
  slot_time        text CHECK (slot_time IS NULL OR slot_time = 'manual' OR slot_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  experiment       text,
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
  -- Reporting columns, derived from the snapshot (never written directly).
  locality         text   GENERATED ALWAYS AS (source_snapshot->>'locality') STORED,
  bhk              text   GENERATED ALWAYS AS (source_snapshot->>'bhk') STORED,
  monthly_rent     bigint GENERATED ALWAYS AS ((source_snapshot->>'monthly_rent')::numeric::bigint) STORED,
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

CREATE INDEX IF NOT EXISTS idx_social_post_jobs_experiment
  ON public.social_post_jobs (experiment, slot_time) WHERE status = 'published';

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

-- ── 6b. Performance: per-post Instagram metrics, one row per day ──────────
-- Filled from the Instagram insights API (Phase 4-5). Numbers are what
-- Instagram reports; nothing is estimated.
CREATE TABLE IF NOT EXISTS public.social_post_metrics (
  job_id              uuid NOT NULL REFERENCES public.social_post_jobs(id) ON DELETE CASCADE,
  captured_on         date NOT NULL,
  reach               integer,
  views               integer,
  likes               integer,
  comments            integer,
  shares              integer,
  saves               integer,
  total_interactions  integer,
  profile_visits      integer,
  follows             integer,
  raw                 jsonb,
  captured_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, captured_on)
);

-- ── 6c. Leads from Instagram comments and DMs (Phase 5) ─────────────────────
-- Minimal personal data: no handles or names, only a hash of Instagram's
-- app-scoped user id (to merge repeat messages) and a staff status.
-- Website inquiries are counted from visit_requests via their utm tags.
CREATE TABLE IF NOT EXISTS public.social_leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            uuid REFERENCES public.social_post_jobs(id) ON DELETE SET NULL,
  flat_code         text,
  channel           text NOT NULL CHECK (channel IN ('comment', 'dm', 'other')),
  ig_user_hash      text,
  visit_request_id  bigint REFERENCES public.visit_requests(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'new' CHECK (status IN (
                      'new', 'qualified', 'not_qualified', 'visit_requested', 'visit_completed', 'rented', 'opted_out')),
  qualified_at      timestamptz,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_leads_job ON public.social_leads (job_id, status);

DROP TRIGGER IF EXISTS trg_social_leads_updated_at ON public.social_leads;
CREATE TRIGGER trg_social_leads_updated_at
  BEFORE UPDATE ON public.social_leads
  FOR EACH ROW EXECUTE FUNCTION public.social_touch_updated_at();

-- Slot comparison for one experiment: published posts per slot with their
-- latest Instagram numbers, website inquiries that arrived through each
-- post's link (visit_requests.attribution utm tags) and Instagram leads.
-- Admin only; returns aggregates, never visit or lead rows.
CREATE OR REPLACE FUNCTION public.social_slot_report(p_experiment text)
RETURNS TABLE (
  slot_time text, posts integer, avg_reach bigint, avg_views bigint,
  shares bigint, saves bigint, inquiries bigint, qualified_leads bigint
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
  WITH posts AS (
    SELECT j.id, j.slot_time AS slot, j.utm_content
    FROM public.social_post_jobs j
    WHERE j.experiment = p_experiment AND j.status = 'published'
  ),
  latest AS (
    SELECT DISTINCT ON (m.job_id) m.job_id, m.reach, m.views, m.shares, m.saves
    FROM public.social_post_metrics m
    WHERE m.job_id IN (SELECT id FROM posts)
    ORDER BY m.job_id, m.captured_on DESC
  ),
  web AS (
    SELECT p.id AS job_id, count(v.id) AS n
    FROM posts p
    JOIN public.visit_requests v
      ON v.attribution->>'utm_source' = 'instagram' AND v.attribution->>'utm_content' = p.utm_content
    GROUP BY p.id
  ),
  ig AS (
    SELECT l.job_id, count(*) AS n,
           count(*) FILTER (WHERE l.status IN ('qualified', 'visit_requested', 'visit_completed', 'rented')) AS q
    FROM public.social_leads l
    WHERE l.job_id IN (SELECT id FROM posts)
    GROUP BY l.job_id
  )
  SELECT p.slot, count(*)::integer, round(avg(lt.reach))::bigint, round(avg(lt.views))::bigint,
         coalesce(sum(lt.shares), 0)::bigint, coalesce(sum(lt.saves), 0)::bigint,
         (coalesce(sum(w.n), 0) + coalesce(sum(ig.n), 0))::bigint, coalesce(sum(ig.q), 0)::bigint
  FROM posts p
  LEFT JOIN latest lt ON lt.job_id = p.id
  LEFT JOIN web w ON w.job_id = p.id
  LEFT JOIN ig ON ig.job_id = p.id
  GROUP BY p.slot
  ORDER BY p.slot;
END;
$$;

-- ── 6d. AI caption cache and usage (budget) ─────────────────────────────────
-- Cache: one AI hook per (prompt version, model, public listing facts), so an
-- unchanged listing never triggers a second paid request. Holds only the
-- hook and hashtags, both built from public facts.
CREATE TABLE IF NOT EXISTS public.social_caption_cache (
  key             text PRIMARY KEY,
  model           text NOT NULL,
  prompt_version  text NOT NULL,
  hook            text NOT NULL,
  hashtags        text[] NOT NULL DEFAULT '{}',
  hits            integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- One row per AI request, for the monthly budget (month = 'YYYY-MM', IST).
CREATE TABLE IF NOT EXISTS public.social_ai_usage (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  month          text NOT NULL CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),
  provider       text NOT NULL DEFAULT 'openai',
  model          text,
  purpose        text NOT NULL DEFAULT 'caption_hook',
  job_id         uuid REFERENCES public.social_post_jobs(id) ON DELETE SET NULL,
  input_tokens   integer NOT NULL DEFAULT 0,
  output_tokens  integer NOT NULL DEFAULT 0,
  cost_usd       numeric(12,6) NOT NULL DEFAULT 0,
  outcome        text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_ai_usage_month ON public.social_ai_usage (month);

-- Count a cache hit (service role only).
CREATE OR REPLACE FUNCTION public.social_caption_cache_hit(p_key text)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.social_caption_cache SET hits = hits + 1 WHERE key = p_key;
$$;

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
ALTER TABLE public.social_post_metrics  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_leads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_caption_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_ai_usage      ENABLE ROW LEVEL SECURITY;
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

DROP POLICY IF EXISTS social_post_metrics_admin_read ON public.social_post_metrics;
CREATE POLICY social_post_metrics_admin_read ON public.social_post_metrics
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS social_leads_admin_read ON public.social_leads;
CREATE POLICY social_leads_admin_read ON public.social_leads
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS social_ai_usage_admin_read ON public.social_ai_usage;
CREATE POLICY social_ai_usage_admin_read ON public.social_ai_usage
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
-- social_caption_cache: no policies; service role only.

-- ── 9. Grants ───────────────────────────────────────────────────────────────
REVOKE ALL ON public.social_settings, public.social_flat_settings, public.social_audio_tracks,
              public.social_post_jobs, public.social_post_assets, public.social_job_events,
              public.social_credentials, public.social_post_metrics, public.social_leads,
              public.social_caption_cache, public.social_ai_usage
  FROM anon, authenticated;

GRANT SELECT ON public.social_settings, public.social_flat_settings, public.social_audio_tracks,
                public.social_post_jobs, public.social_post_assets, public.social_job_events,
                public.social_post_metrics, public.social_leads, public.social_ai_usage
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_settings, public.social_flat_settings,
              public.social_audio_tracks, public.social_post_jobs, public.social_post_assets,
              public.social_job_events, public.social_credentials, public.social_post_metrics,
              public.social_leads, public.social_caption_cache, public.social_ai_usage
  TO service_role;

REVOKE ALL ON FUNCTION public.social_connection_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_connection_status() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.social_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_slot_report(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_slot_report(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.social_caption_cache_hit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.social_caption_cache_hit(text) TO service_role;

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
--   SELECT has_table_privilege('anon', 'public.social_leads', 'SELECT');               -- false
--
-- Website count is unchanged:
--   SELECT count(*) FROM public.public_listings;
--
-- ── Rollback ────────────────────────────────────────────────────────────────
-- Removes everything this file added. Nothing else depends on these objects.
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.social_connection_status();
--   DROP FUNCTION IF EXISTS public.social_slot_report(text);
--   DROP FUNCTION IF EXISTS public.social_caption_cache_hit(text);
--   DROP TABLE IF EXISTS public.social_ai_usage, public.social_caption_cache,
--     public.social_leads, public.social_post_metrics,
--     public.social_job_events, public.social_post_assets,
--     public.social_post_jobs, public.social_audio_tracks, public.social_flat_settings,
--     public.social_settings, public.social_credentials;
--   DROP FUNCTION IF EXISTS public.social_touch_updated_at();
--   COMMIT;
--   NOTIFY pgrst, 'reload schema';

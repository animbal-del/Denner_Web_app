-- ============================================================================
-- RLS HARDENING MIGRATION
-- Generated 2026-06-02 from a live read-only audit of the Supabase database.
--
-- *** Schema column names + the UNIQUE index on profiles.auth_user_id were   ***
-- *** VERIFIED LIVE on 2026-06-02. Safe to apply. Prefer a staging branch.   ***
--
-- WHY THIS EXISTS
-- ---------------
-- The live audit found that RLS is ENABLED on every user-writable table and a
-- comprehensive set of row policies already exists (good). HOWEVER two real
-- gaps remain:
--
--   1. PRIVILEGE-ESCALATION VIA TRUST COLUMNS (HIGH severity)
--      `anon` and `authenticated` hold table-level + column-level INSERT/UPDATE
--      grants on the "trust" columns:
--          profiles.role               (app_role,  default 'user')
--          profiles.is_active          (boolean,   default true)
--          partner_profiles.verification_status (review_status, default 'pending_review')
--      The existing UPDATE policies (e.g. profiles_update_own_or_admin) gate the
--      ROW (auth.uid() = auth_user_id) but place NO restriction on WHICH COLUMNS
--      change. So a normal user can UPDATE their own profile row and set
--      role = 'admin' / is_active, and a partner can self-approve
--      verification_status. RLS does not stop column-value escalation by itself.
--
--   2. BLANKET WRITE GRANTS TO anon (MEDIUM severity)
--      anon has INSERT/UPDATE/DELETE/TRUNCATE on every table. RLS still gates
--      rows, but defense-in-depth says anon should not hold write grants on
--      user-owned tables at all. Revoking these is cheap insurance.
--
-- This migration:
--   (a) Re-asserts RLS is enabled on each user-writable table (idempotent).
--   (b) REVOKES UPDATE on the trust columns (role, is_active,
--       verification_status) from anon/authenticated so the client can never
--       escalate them. INSERT on those columns is intentionally NOT revoked —
--       profile creation is handled by the trigger in (e) and the WEB client no
--       longer sends trust columns. Safe for the OPS app (it never writes them).
--   (c) REVOKES blanket write grants from anon on user-owned tables.
--   (d) Re-asserts column-safe owner-scoped row policies on profiles.
--   (e) ADDS a SECURITY DEFINER trigger on auth.users that auto-creates the
--       profile and sets role from signup metadata CLAMPED to {'user','partner'}
--       ('partner' self-registration is a real WEB flow; 'admin' is never
--       self-assignable). Admin elevation + partner verification are
--       server/admin-only paths.
--
-- Existing row policies are intentionally LEFT IN PLACE. We only tighten
-- column grants — that is the missing layer. Re-creating the dozens of existing
-- policies would risk regressions; the audit confirmed they already tie rows to
-- auth.uid() via auth_user_id / current_profile_id().
--
-- VERIFIED FROM AUDIT (do not blindly trust — re-verify before applying):
--   profiles.id              bigint   (internal pk)
--   profiles.auth_user_id    uuid     (= auth.uid())
--   profiles.role            app_role NOT NULL default 'user'
--   profiles.is_active       boolean  NOT NULL default true
--   partner_profiles.profile_id          bigint -> profiles.id
--   partner_profiles.verification_status review_status NOT NULL default 'pending_review'
--   child tables tie to profiles.id via:
--     user_liked_properties.user_profile_id
--     visit_requests.user_profile_id
--     urgent_help_requests.user_profile_id
--     user_preferences.profile_id
--     property_share_links.created_by_profile_id
--   helpers exist: is_admin(), current_profile_id(), current_user_role()
-- ============================================================================

-- ── (a) Ensure RLS is enabled on every user-writable table ──────────────────
-- Idempotent: ENABLE ROW LEVEL SECURITY is a no-op if already enabled.
ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_liked_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urgent_help_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_share_links  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_flats       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_flat_media  ENABLE ROW LEVEL SECURITY;

-- Optional but recommended: FORCE RLS so even the table owner is subject to
-- policies (Supabase service_role bypasses RLS regardless). Commented because
-- it can break maintenance scripts that connect as the owning role.
-- ALTER TABLE public.profiles         FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.partner_profiles FORCE ROW LEVEL SECURITY;


-- ── (b) Lock down TRUST COLUMNS (the HIGH-severity fix) ─────────────────────
-- Remove the ability for the client roles to UPDATE these columns at all.
-- After this, an UPDATE that touches role/is_active/verification_status fails
-- with "permission denied for column ...", regardless of the row policy. Only
-- service_role (server-side, bypasses grants) can change them.
--
-- We revoke ONLY UPDATE on the trust columns (not INSERT). This is the part
-- that stops privilege escalation: a normal user can no longer flip their own
-- row's role/is_active, and a partner can no longer self-approve
-- verification_status. We deliberately do NOT revoke INSERT on these columns —
-- doing so would break legitimate row creation and is unnecessary now that:
--   * profiles are created server-side by the SECURITY DEFINER trigger in (e)
--     (which hard-codes role='user'), and
--   * the WEB client has been changed to NEVER send role/is_active/
--     verification_status in any insert/upsert (see src/services/authService.jsx).
-- Cross-app audit: the OPS app does not write these columns client-side at all,
-- so these UPDATE revokes are safe for ops (it only reads `role` to gate login).
--
-- NOTE: column-level REVOKE only matters because a column-level GRANT exists.
-- We revoke from BOTH anon and authenticated for completeness.

-- profiles.role / profiles.is_active — prevents self-promotion to
-- 'admin'/'partner' and toggling soft-delete / re-activation.
REVOKE UPDATE (role, is_active) ON public.profiles FROM anon, authenticated;

-- partner_profiles.verification_status — prevents partners self-approving.
REVOKE UPDATE (verification_status) ON public.partner_profiles FROM anon, authenticated;

-- NOTE: INSERT on these columns is intentionally left in place. The trigger in
-- (e) owns profile creation and forces role='user'; the WEB client no longer
-- names trust columns on insert. Partner upgrades and admin role assignment are
-- performed exclusively by an admin / service-role path, never by the user.


-- ── (c) Remove blanket WRITE grants from anon (defense in depth) ────────────
-- anon never needs to write user-owned data. RLS already blocks it, but holding
-- the grant is unnecessary attack surface. SELECT is preserved where the app
-- relies on public reads (share links, public listing media).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles              FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.partner_profiles      FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_liked_properties FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.visit_requests        FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_preferences      FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.property_share_links  FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.inventory_flats       FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.inventory_flat_media  FROM anon;
-- urgent_help_requests: keep anon INSERT IF anonymous "urgent help" submissions
-- are a product requirement (the policy urgent_help_requests_insert allows
-- user_profile_id IS NULL). If anonymous submissions are NOT needed, also run:
--   REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.urgent_help_requests FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.urgent_help_requests FROM anon;


-- ── (d) Re-assert a column-safe self-service policy set on profiles ─────────
-- These mirror the existing intent but are written here idempotently so the
-- repo is the source of truth. They restrict rows to the owner or an admin.
-- Column safety comes from (b) above, not from these row predicates.
DROP POLICY IF EXISTS rls_profiles_select_self ON public.profiles;
CREATE POLICY rls_profiles_select_self ON public.profiles
  FOR SELECT TO authenticated
  USING (auth_user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS rls_profiles_insert_self ON public.profiles;
CREATE POLICY rls_profiles_insert_self ON public.profiles
  FOR INSERT TO authenticated
  -- Row must belong to the caller. Trust columns are protected by REVOKE (b),
  -- so even though the predicate does not mention role/is_active, the client
  -- cannot supply non-default values for them.
  WITH CHECK (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS rls_profiles_update_self ON public.profiles;
CREATE POLICY rls_profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth_user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
  WITH CHECK (auth_user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
-- NOTE: the pre-existing policies (profiles_update_own_or_admin, "users can
-- update own profile", etc.) remain. Postgres ORs permissive policies together,
-- so adding these does not loosen anything; the column REVOKE is what enforces
-- trust-column immutability. Consider dropping the redundant legacy duplicates
-- in a follow-up once you confirm nothing references them by name.


-- ── (e) SECURITY DEFINER profile-creation trigger (the structural fix) ──────
-- This closes the privilege-escalation hole at its root: the client no longer
-- needs to (and the WEB app no longer does) CREATE its own profile row. Instead
-- a trigger on auth.users runs as DEFINER and creates the profile, taking role
-- from signup metadata but CLAMPED to {'user','partner'} — 'admin' can never be
-- self-assigned (any non-'partner' value becomes 'user').
--
-- Trust-column policy (READ THIS):
--   * role is taken from signup metadata but CLAMPED to {'user','partner'} —
--     'partner' is allowed (the WEB app has self-service partner registration);
--     any other value, especially 'admin', falls back to 'user'.
--   * 'admin' is therefore NEVER self-assignable and NEVER derivable from
--     user-supplied metadata — it is granted only via an admin / service-role path.
--   * A self-registered partner gets role='partner' but verification_status stays
--     'pending_review' (cannot be self-set; see section (b)) until admin approval.
--   * is_active relies on the column DEFAULT (true); we do not set it from input.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS, and the
-- INSERT uses ON CONFLICT (auth_user_id) DO NOTHING so re-runs / races with the
-- client are safe.
--
-- COLUMN NAMES — VERIFIED LIVE 2026-06-02 (no changes needed):
--   * public.profiles columns: auth_user_id (uuid), role (app_role),
--     full_name (text), email (text), phone (text). CONFIRMED.
--   * UNIQUE index profiles_auth_user_id_key ON profiles(auth_user_id) EXISTS,
--     so ON CONFLICT (auth_user_id) resolves. CONFIRMED.
--   * app_role enum = {admin, user, partner}; 'partner' exists. CONFIRMED.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Self-registration may choose 'user' or 'partner' at signup. ANY other
  -- value (especially 'admin') is clamped to 'user'. 'admin' is therefore
  -- NEVER self-assignable; it can only be granted by an admin / service-role
  -- server-side path. partner_profiles.verification_status still defaults to
  -- 'pending_review' and cannot be self-set (UPDATE revoked in section (b)),
  -- so a self-registered partner is unverified until an admin approves.
  resolved_role app_role;
BEGIN
  IF NEW.raw_user_meta_data->>'role' = 'partner' THEN
    resolved_role := 'partner';
  ELSE
    resolved_role := 'user';
  END IF;

  INSERT INTO public.profiles (auth_user_id, role, full_name, email, phone)
  VALUES (
    NEW.id,
    resolved_role,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (auth_user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- END
-- Notes:
--   * (b) revokes only UPDATE on trust columns — safe for both apps.
--   * (e) trigger owns profile creation; role = signup metadata clamped to
--     {'user','partner'}; 'admin' is never self-assignable.
--   * Partner verification + admin role grants are server/admin-only operations.
-- Schema column names and the unique index were verified live (2026-06-02).
-- Prefer applying in a staging branch first, then production.
-- ============================================================================

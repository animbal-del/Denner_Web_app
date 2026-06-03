-- ============================================================================
-- FIX: trust-column lock that actually works
--
-- The earlier migration (20260602120000_rls_policies.sql) tried to lock the
-- trust columns with COLUMN-LEVEL `REVOKE UPDATE (role, is_active) ...`. That is
-- a NO-OP in Postgres when a TABLE-LEVEL `GRANT UPDATE` exists: Supabase grants
-- `authenticated` table-wide UPDATE on these tables, so the column-level revoke
-- removed nothing and role/is_active/verification_status remained client-writable.
--
-- Verified live 2026-06-03: `authenticated` held table-level
--   INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
-- on both public.profiles and public.partner_profiles.
--
-- Correct approach: REVOKE the table-wide UPDATE, then GRANT UPDATE on ONLY the
-- non-trust columns the apps actually write. Verified from both codebases:
--   profiles:         web updates full_name, phone, email, city, state
--   partner_profiles: web only INSERTs (never UPDATEs); ops writes neither table
-- service_role bypasses grants, so server/admin paths can still change anything.
--
-- Plus: BEFORE INSERT guards so a client cannot escalate at INSERT time either
-- (raw API insert of role='admin' or verification_status='verified' on its own
-- row). The guards clamp ONLY for an 'authenticated' caller that is not an admin;
-- the SECURITY DEFINER signup trigger (handle_new_user) and service_role are
-- unaffected. role='partner' self-registration is preserved (only 'admin' clamps).
-- ============================================================================

-- ── profiles: column-scoped UPDATE ──────────────────────────────────────────
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT  UPDATE (full_name, phone, email, city, state) ON public.profiles TO authenticated;
-- Prevent delete-then-reinsert escalation; users have no reason to delete profiles.
REVOKE DELETE ON public.profiles FROM authenticated;

-- ── partner_profiles: column-scoped UPDATE ──────────────────────────────────
REVOKE UPDATE ON public.partner_profiles FROM authenticated;
GRANT  UPDATE (partner_type, company_name, locality, section) ON public.partner_profiles TO authenticated;

-- ── INSERT-time guard on profiles.role (block 'admin'; allow user/partner) ───
CREATE OR REPLACE FUNCTION public.guard_profile_role_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only a non-admin 'authenticated' caller is constrained. service_role and the
  -- SECURITY DEFINER signup trigger run as other roles and are unaffected.
  IF NEW.role = 'admin' AND current_user = 'authenticated' AND NOT public.is_admin() THEN
    NEW.role := 'user';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_profile_role ON public.profiles;
CREATE TRIGGER trg_guard_profile_role
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role_insert();

-- ── INSERT-time guard on partner_profiles.verification_status ────────────────
CREATE OR REPLACE FUNCTION public.guard_partner_verification_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_user = 'authenticated' AND NOT public.is_admin() THEN
    NEW.verification_status := 'pending_review';  -- force the safe default
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_partner_verification ON public.partner_profiles;
CREATE TRIGGER trg_guard_partner_verification
  BEFORE INSERT ON public.partner_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_partner_verification_insert();

-- ============================================================================
-- After this: a normal authenticated user can update only profile contact
-- fields; role / is_active / verification_status are immutable to them on both
-- UPDATE (column grant) and INSERT (guards). admin/service_role retain control.
-- ============================================================================

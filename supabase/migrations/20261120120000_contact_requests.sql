-- "Talk to us" contact requests
--
-- The /contact page form ("Tell us what you need") opens WhatsApp with the
-- visitor's details AND saves a copy here, so Ops has a record even if the
-- visitor never presses send in WhatsApp.
--
-- Anyone can submit (logged out visitors included). Nobody but admins can read.
-- Logged-in visitors are linked to their profile; the policy stops anyone from
-- attaching a request to someone else's profile.
--
-- Run order: this file, THEN deploy web. Until it is applied, the form still
-- opens WhatsApp; only the saved copy fails (silently, logged to the console).

CREATE TABLE IF NOT EXISTS public.contact_requests (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at       timestamptz NOT NULL DEFAULT now(),
  user_profile_id  bigint REFERENCES public.profiles(id) ON DELETE SET NULL,
  name             text CHECK (char_length(name) <= 120),
  flat_size        text CHECK (char_length(flat_size) <= 20),
  preferred_area   text CHECK (char_length(preferred_area) <= 200),
  budget           text CHECK (char_length(budget) <= 40),
  moving_in        text CHECK (char_length(moving_in) <= 40),
  source_path      text CHECK (char_length(source_path) <= 200),
  status           text NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new', 'contacted', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_contact_requests_created_at
  ON public.contact_requests (created_at DESC);

ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

-- Insert only; the site never reads these back.
REVOKE ALL ON public.contact_requests FROM anon, authenticated;
GRANT INSERT (user_profile_id, name, flat_size, preferred_area, budget, moving_in, source_path)
  ON public.contact_requests TO anon, authenticated;

DROP POLICY IF EXISTS contact_requests_insert ON public.contact_requests;
CREATE POLICY contact_requests_insert ON public.contact_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    user_profile_id IS NULL
    OR user_profile_id = (SELECT public.current_profile_id())
  );

-- Admins (Ops) can read and update status.
GRANT SELECT, UPDATE (status) ON public.contact_requests TO authenticated;

DROP POLICY IF EXISTS contact_requests_admin_select ON public.contact_requests;
CREATE POLICY contact_requests_admin_select ON public.contact_requests
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS contact_requests_admin_update ON public.contact_requests;
CREATE POLICY contact_requests_admin_update ON public.contact_requests
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

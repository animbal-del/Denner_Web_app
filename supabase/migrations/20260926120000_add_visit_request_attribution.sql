-- ============================================================================
-- Ad attribution on visit requests
-- ----------------------------------------------------------------------------
-- The web app stores the landing-URL click IDs / UTMs (gclid, gbraid, wbraid,
-- utm_source, utm_medium, utm_campaign, utm_term, utm_content, landing_path,
-- captured_at) and sends them with each visit request, so every lead can be
-- tied to the Google Ads click that produced it (and later imported back to
-- Google Ads as an offline conversion).
--
-- Additive and idempotent: nullable column, existing rows untouched. The
-- explicit column grant is a no-op where a table-level INSERT grant already
-- exists, and keeps renter inserts working if grants were ever narrowed.
-- The size cap stops a client from stuffing arbitrary data into the column.
-- ============================================================================

ALTER TABLE public.visit_requests
  ADD COLUMN IF NOT EXISTS attribution jsonb;

ALTER TABLE public.visit_requests
  DROP CONSTRAINT IF EXISTS visit_requests_attribution_size;
ALTER TABLE public.visit_requests
  ADD CONSTRAINT visit_requests_attribution_size
  CHECK (attribution IS NULL OR pg_column_size(attribution) <= 4096);

GRANT INSERT (attribution) ON public.visit_requests TO authenticated;

CREATE INDEX IF NOT EXISTS idx_visit_requests_gclid
  ON public.visit_requests ((attribution->>'gclid'))
  WHERE attribution ? 'gclid';

COMMENT ON COLUMN public.visit_requests.attribution IS
  'First-party ad attribution captured on landing (gclid/gbraid/wbraid/utm_*). No PII.';

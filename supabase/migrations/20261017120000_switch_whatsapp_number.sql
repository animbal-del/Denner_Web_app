-- Switch Denner's WhatsApp number from 9156005618 (banned) to 9518974818
--
-- Changes, in both tables, only the old number and the old WhatsApp short link:
--   inventory_flats.handler_whatsapp_number  '+91 9156005618' -> '+91 9518974818'
--     (the number "Schedule visit" opens on the website)
--   inventory_flats.description              '9156005618' -> '9518974818'
--   inventory_flat_intake.raw_description    '9156005618' -> '9518974818'
--     (the text the Facebook bot posts)
--   https://tinyurl.com/ae5zb4cz (pointed to wa.me/9156005618) -> direct wa.me link
-- "/ 7020738841" stays as it is.
--
-- Triggers are paused while it runs so updated_at is NOT bumped: public_listings
-- hides flats not edited in 2 months (20261009120000_hide_stale_listings.sql),
-- and bumping every flat would put ~400 stale flats back on the website.
--
-- Also restores flat 9's updated_at, which a one-row API test on 2026-10-17 bumped.
--
-- Backup of every touched field (taken before any change):
--   ~/denner-backups/2026-10-17-number-change/
--
-- Run the whole file at once in the Supabase SQL editor. If any statement fails,
-- nothing is changed.

BEGIN;

ALTER TABLE public.inventory_flats DISABLE TRIGGER USER;
ALTER TABLE public.inventory_flat_intake DISABLE TRIGGER USER;

UPDATE public.inventory_flats
SET handler_whatsapp_number = '+91 9518974818'
WHERE handler_whatsapp_number LIKE '%9156005618%';

UPDATE public.inventory_flats
SET description = replace(
      replace(description, 'tinyurl.com/ae5zb4cz',
              'wa.me/919518974818?text=Hi%2C%20I%27m%20interested%20in%20the%20flat'),
      '9156005618', '9518974818')
WHERE description LIKE '%9156005618%' OR description LIKE '%tinyurl.com/ae5zb4cz%';

UPDATE public.inventory_flat_intake
SET raw_description = replace(
      replace(raw_description, 'tinyurl.com/ae5zb4cz',
              'wa.me/919518974818?text=Hi%2C%20I%27m%20interested%20in%20the%20flat'),
      '9156005618', '9518974818')
WHERE raw_description LIKE '%9156005618%' OR raw_description LIKE '%tinyurl.com/ae5zb4cz%';

UPDATE public.inventory_flats
SET updated_at = '2026-04-22 16:38:01.558057+00'
WHERE id = 9;

ALTER TABLE public.inventory_flats ENABLE TRIGGER USER;
ALTER TABLE public.inventory_flat_intake ENABLE TRIGGER USER;

COMMIT;

-- Expected: 0 | 566 | 0 | 0 | 165 (website count unchanged)
SELECT
  (SELECT count(*) FROM public.inventory_flats WHERE handler_whatsapp_number LIKE '%9156005618%') AS old_handler_left,
  (SELECT count(*) FROM public.inventory_flats WHERE handler_whatsapp_number = '+91 9518974818') AS new_handler,
  (SELECT count(*) FROM public.inventory_flats WHERE description LIKE '%9156005618%') AS old_in_flat_desc,
  (SELECT count(*) FROM public.inventory_flat_intake
     WHERE raw_description LIKE '%9156005618%' OR raw_description LIKE '%ae5zb4cz%') AS old_in_raw_desc,
  (SELECT count(*) FROM public.public_listings) AS website_flats;

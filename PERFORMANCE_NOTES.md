# Denner Web Performance Notes

This build focuses on making the public Phase B browsing flow lighter.

## What changed
- Listing page is paginated at 12 properties per page.
- Listing page fetches cover media only.
- Full gallery loads only on the property detail page.
- React StrictMode was removed to avoid duplicate development-time fetches.
- Property data is kept in a page-level provider and filtered client-side after load.

## Things to verify in Supabase
- `property-media` bucket accessibility for public browsing
- `inventory_flat_media.storage_path` correctness
- indexes on public filtering fields

## Suggested SQL indexes
```sql
create index if not exists idx_inventory_flats_public_listing
on public.inventory_flats (listing_status, business_status, updated_at desc);

create index if not exists idx_inventory_flats_city_bhk
on public.inventory_flats (city, bhk);

create index if not exists idx_inventory_flat_media_cover_lookup
on public.inventory_flat_media (flat_id, is_cover, sort_order);

create index if not exists idx_property_share_links_active_lookup
on public.property_share_links (flat_id, is_active, created_at desc);
```

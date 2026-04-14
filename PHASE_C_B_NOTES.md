# Phase C-B Notes

This build adds the first renter-side visit request flow while keeping the working Phase B browsing base intact.

Included in this build:
- Request Visit CTA on property detail page for renter accounts
- request modal with preferred date, preferred time slot, WhatsApp number, and optional note
- insert into `visit_requests`
- account page section showing submitted visit requests

Current insert payload uses these confirmed columns:
- `flat_id`
- `user_profile_id`
- `flat_code_snapshot`
- `request_source`
- `whatsapp_number_used`
- `status`
- `scheduled_date`
- `scheduled_time`
- `user_notes`

Intentionally not writing the richer snapshot fields yet:
- `first_time_form_snapshot`
- `preferred_localities_snapshot`
- `rent_min_snapshot`
- `rent_max_snapshot`
- `handler_profile_id`
- `admin_notes`

This keeps the Phase C-B launch stable and avoids type/schema guessing.

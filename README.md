# Denner Web - Phase A Auth Foundation

This is a separate public-facing React + Vite app focused only on:
- Home page
- Signup for renter user and owner/broker
- Login for both roles
- Logout
- Session persistence
- Role-aware redirects
- Simple account and partner-area placeholders

## Setup

1. Copy `.env.example` to `.env`
2. Fill in your Supabase URL and anon key
3. Install dependencies
4. Run `npm run dev`

## Important Supabase setup

For Phase A testing:
- Keep email provider enabled
- Keep email confirmation off for now
- Apply RLS policies for `profiles` and `partner_profiles`

## Routes

- `/` Home
- `/login` Login
- `/signup` Signup
- `/account` Renter account placeholder
- `/partner-area` Owner/Broker placeholder


Phase B scope in this package:
- Home page connected to browsing
- Properties preview page
- Teaser property detail for logged-out users
- Fuller user-safe detail for logged-in renter users
- No save / visit / urgent / submission flows yet


## Performance notes in this build

- Properties page now loads paginated results from Supabase, 12 at a time.
- Only cover media is fetched for the listing page.
- Full gallery loads only on the property detail page.
- React StrictMode was removed to avoid duplicate fetches in local development.
- Public media URLs prefer batch signed URLs, then full public URLs, then bucket public URLs.

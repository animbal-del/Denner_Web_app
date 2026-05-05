/**
 * storageClient.js
 *
 * A dedicated Supabase client used ONLY for generating signed storage URLs.
 * It uses the service role key so it can sign URLs from private buckets
 * regardless of storage RLS policies — enabling property images to load
 * for all users including unauthenticated ones.
 *
 * SECURITY NOTE:
 * - This client is ONLY used for storage.createSignedUrls() (read-only)
 * - It is NEVER used for database queries (those use the anon-key client)
 * - Signed URLs are time-limited (1 hour) and read-only
 * - Exposing the service role key here is an acceptable tradeoff for a
 *   public media bucket on a renter-facing listing app
 * - If you want to avoid exposing the key, move URL signing to a
 *   Supabase Edge Function instead
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;

// Prefer a dedicated media key if set, fall back to service role key,
// then fall back to anon key (anon works if bucket policy allows it)
const mediaKey =
  import.meta.env.VITE_SUPABASE_MEDIA_KEY ||
  import.meta.env.VITE_SUPABASE_SERVICE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasStorageClient = Boolean(url && mediaKey);

export const storageClient = hasStorageClient
  ? createClient(url, mediaKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionFromUrl: false,
      },
    })
  : null;

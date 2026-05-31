# Egress Reduction Strategy — Denner Web

> Context: Supabase project hit `exceed_cached_egress_quota` at 400% over limit.
> Goal: Cut Supabase egress to below the free-tier quota and keep it there permanently.

---

## Root Causes (Diagnosed)

| Cause | Impact |
|---|---|
| Full-resolution images served on listing cards | Very high — every page load downloads large images |
| Videos served via direct Supabase signed URLs, not CDN | Very high — no caching, every user streams from Supabase |
| Signed URL TTL is 1 hour — regenerated every session | Medium — repeated Supabase API calls even without file download |
| Image proxy cache TTL is 24h | Medium — global CDN re-fetches from Supabase every 24h |
| `fetchAllProperties()` loads 500 rows unconstrained | Medium — heavy DB egress on map/filter views |
| Videos load metadata on render (`preload="metadata"`) | Medium — browser fetches video header even if user never plays |
| No thumbnail-sized images for listing grid | Medium — full images served where 400px would suffice |

---

## Phase 1 — Storage: Aggressive File Compression (Do Now)

**Status: Partially done.** Images compressed to JPEG q80/1920px (-71%), videos to H.264 CRF28 (-38%).

### 1A. Convert images to WebP at lower quality

Re-run compression at WebP q70, max 1280px. WebP is 25–35% smaller than JPEG at same perceived quality.

```bash
# Update compress-storage.mjs: change JPEG_Q=80 → 70, MAX_WIDTH=1920 → 1280, output WebP
node scripts/compress-storage.mjs
```

Expected additional saving: ~120–150 MB (from current 383 MB → ~230 MB)

### 1B. Re-encode videos more aggressively

Re-run video compression at CRF 32 (from 28), max 1280px.

```bash
# Update compress-videos.mjs: change crf 28 → 32, scale 1920 → 1280
node scripts/compress-videos.mjs
```

Expected additional saving: ~80–100 MB (from current 388 MB → ~290 MB)

**Combined Phase 1 result: ~771 MB → ~520 MB in bucket (-33% further)**

---

## Phase 2 — Proxy: Route Everything Through Vercel CDN (High Priority)

The Vercel `/api/media` proxy already exists and caches responses at Vercel's global CDN. The problem: **videos bypass it entirely** and stream directly from Supabase.

### 2A. Route videos through `/api/media`

Currently in `publicPropertiesService.js`:
```js
if (isVideo) {
  // Videos are too large to proxy — use signed URL directly  ← WRONG
  if (signedUrlMap.has(normalized)) candidates.push(signedUrlMap.get(normalized));
}
```

Fix: stream videos through `/api/media` just like images. Vercel supports large file streaming and range requests.

```js
// Both images AND videos go through the proxy
candidates.push(`/api/media?path=${encodeURIComponent(normalized)}`);
if (signedUrlMap.has(normalized)) candidates.push(signedUrlMap.get(normalized)); // fallback
```

Update `api/media.js` to pass through video content with proper headers:
```js
// For video, stream with range request support + long cache
res.setHeader('Content-Type', contentType);
res.setHeader('Cache-Control', 'public, s-maxage=604800, max-age=86400, stale-while-revalidate=2592000');
res.setHeader('Accept-Ranges', 'bytes');
```

**Impact: All video traffic moves off Supabase egress → Vercel CDN. Videos cached for 7 days.**

### 2B. Increase image cache TTL from 24h to 7 days

In `api/media.js`, current cache header:
```js
const CACHE = 'public, s-maxage=86400, max-age=3600, stale-while-revalidate=604800';
//                       ↑ 1 day
```

Change to:
```js
const CACHE = 'public, s-maxage=604800, max-age=86400, stale-while-revalidate=2592000';
//                       ↑ 7 days                        ↑ 30 days stale-while-revalidate
```

Property photos don't change once uploaded. 7-day CDN cache means Vercel fetches from Supabase once per week instead of once per day per edge node.

### 2C. Serve thumbnails at correct size in listing grid

`MediaAsset.jsx` already accepts `imgWidth` and appends `?w=` to the proxy URL. The proxy already resizes via Sharp. This just needs to be wired up from the listing card component.

```jsx
// In the property listing card component — pass a thumbnail width
<MediaAsset media={property.media[0]} imgWidth={600} />

// In the property detail / lightbox — full size
<MediaAsset media={item} imgWidth={1280} />
```

**Impact: Listing cards serve ~600px images instead of ~1280–1920px. Roughly 3-5x smaller per request.**

---

## Phase 3 — Client: Eliminate Unnecessary Requests (Medium Priority)

### 3A. Change video preload from "metadata" to "none"

In `MediaAsset.jsx`:
```jsx
// Current — browser fetches video header (can be 100KB+ for MP4 moov atom)
<video preload="metadata" ... />

// Fix — don't fetch anything until user clicks play
<video preload="none" poster={posterUrl} ... />
```

Add a poster image (first frame or cover photo) so users see something without loading the video.

**Impact: Eliminates ~100–500 KB per video element rendered on screen, even if never played.**

### 3B. Extend signed URL TTL from 1 hour to 7 days

In `publicPropertiesService.js`:
```js
// Current
.createSignedUrls(chunk, 60 * 60); // 1 hour

// Fix
.createSignedUrls(chunk, 60 * 60 * 24 * 7); // 7 days
```

These signed URLs are used as fallbacks. Longer TTL = TanStack Query's 5-minute stale cache stays valid = fewer Supabase API calls per session.

### 3C. Stop generating signed URLs for image rows

Images always go through `/api/media` (which uses the service role internally). Generating signed URLs for images is wasted Supabase API calls. Only videos need signed URLs as fallback.

```js
// Current — generates signed URLs for ALL media rows
const signedUrlMap = await createSignedMediaUrlMap(rows);

// Fix — only generate for video rows
const videoRows = rows.filter(r => r.media_type === 'video');
const signedUrlMap = await createSignedMediaUrlMap(videoRows);
```

This is already done in `fetchCoverMediaMap` but NOT in `fetchAllMediaForFlat` — fix that function too.

---

## Phase 4 — Database Egress (Lower Priority, Already Partially Done)

### 4A. Constrain `fetchAllProperties()`

```js
// Current — fetches all 500 rows on every map/filter view load
.limit(500)

// Fix — paginate this too, or only load IDs + cover for map pins
.select('id, society_name, locality, monthly_rent, cover_image_url')
.limit(200)
```

### 4B. Remove `getFilterOptions()` full scan

`getFilterOptions()` fetches 500 rows to build filter dropdowns. This should be a dedicated `DISTINCT` query or a materialized/cached endpoint.

```js
// Replace with distinct queries per field
supabase.from('public_listings').select('locality').order('locality').limit(500)
// ... one per filter dimension, not one fat query
```

### 4C. Add DB indexes for common filter queries

Run `scripts/add-indexes.sql` in the Supabase dashboard SQL editor (already written, not yet applied).

---

## Phase 5 — Monitoring (Prevent Recurrence)

### 5A. Set up Supabase usage alerts

In Supabase dashboard → Settings → Billing → Usage alerts. Set alert at 70% of egress quota so there's time to react.

### 5B. Track egress per file type

Add logging to `api/media.js` to count requests per content type. Helps identify if a single property's images/video is responsible for spike traffic.

```js
// Log content type and size on each proxy request
console.log(JSON.stringify({ type: contentType, bytes: body.length, path: storagePath }));
```

Vercel logs these — review weekly via Vercel dashboard.

---

## Priority Order

| # | Action | Effort | Egress Impact |
|---|---|---|---|
| 1 | Re-compress images to WebP q70/1280px | 5 min (run script) | High |
| 2 | Re-compress videos to CRF32/1280px | 5 min (run script) | Medium |
| 3 | Route videos through `/api/media` | 30 min (code) | **Very High** |
| 4 | Increase CDN cache TTL to 7 days | 5 min (code) | High |
| 5 | Pass `imgWidth` to listing cards | 15 min (code) | High |
| 6 | `preload="none"` on videos | 10 min (code) | Medium |
| 7 | Extend signed URL TTL to 7 days | 5 min (code) | Medium |
| 8 | Skip signed URLs for image rows | 10 min (code) | Low–Medium |
| 9 | Constrain `fetchAllProperties()` | 20 min (code) | Low |
| 10 | Usage alerts in Supabase dashboard | 5 min (dashboard) | Prevention |

**Estimated total egress reduction after all phases: ~85–90% vs. pre-compression baseline.**

import { fetchFilterOptions, fetchRentBoundsForLocalities } from './_db.js';

// 5-min CDN cache — rent bounds change when new listings are added.
const CACHE = 'public, s-maxage=300, stale-while-revalidate=3600';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).setHeader('Allow', 'GET').end();

  const localities = req.query.localities
    ? String(req.query.localities).split(',').filter(Boolean)
    : [];

  try {
    if (!localities.length) {
      // No filter — return global bounds from filter-options RPC (already cached)
      const opts = await fetchFilterOptions();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', CACHE);
      return res.status(200).json(opts.rentBounds);
    }

    // Locality-specific bounds — shared singleton client, capped at 5 localities.
    const bounds = await fetchRentBoundsForLocalities(localities);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', CACHE);
    return res.status(200).json(bounds);
  } catch {
    return res.status(500).json({ error: 'Failed to load rent bounds' });
  }
}

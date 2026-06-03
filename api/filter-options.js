import { fetchFilterOptions } from './_db.js';

// 1-hour CDN cache — filter options (cities, localities, etc.) rarely change.
const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).setHeader('Allow', 'GET').end();

  try {
    const data = await fetchFilterOptions();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', CACHE);
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ error: 'Failed to load filter options' });
  }
}

import { fetchProperties, fetchPropertiesByIds, PUBLIC_PAGE_SIZE } from './_db.js';

// 5-min CDN cache, serve stale for 1h while revalidating in background.
// Property data changes infrequently enough that 5-min lag is acceptable.
const CACHE = 'public, s-maxage=300, stale-while-revalidate=3600';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).setHeader('Allow', 'GET').end();

  try {
    // Liked-properties path: ?ids=1,2,3
    if (req.query.ids) {
      const ids = String(req.query.ids).split(',').map(Number).filter(Boolean);
      const items = await fetchPropertiesByIds(ids);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', CACHE);
      return res.status(200).json(items);
    }

    // Paginated + filtered listing path
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const filters = {
      localities: req.query.localities ? String(req.query.localities).split(',').filter(Boolean) : [],
      city:             req.query.city             || '',
      propertyType:     req.query.propertyType     || '',
      furnishingStatus: req.query.furnishingStatus || '',
      bhk:              req.query.bhk              || '',
      sortBy:           req.query.sortBy           || 'newest',
      search:           req.query.search           || '',
    };

    const data = await fetchProperties(filters, page, PUBLIC_PAGE_SIZE);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', CACHE);
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ error: 'Failed to load properties' });
  }
}

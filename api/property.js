import { fetchPropertyByRef } from './_db.js';

// 5-min CDN cache per share code.
const CACHE = 'public, s-maxage=300, stale-while-revalidate=3600';

export default async function handler(req, res) {
  const { shareCode } = req.query;
  if (!shareCode || typeof shareCode !== 'string') {
    return res.status(400).json({ error: 'Missing shareCode' });
  }

  try {
    const property = await fetchPropertyByRef(shareCode);
    if (!property) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', CACHE);
    return res.status(200).json(property);
  } catch {
    return res.status(500).json({ error: 'Failed to load property' });
  }
}

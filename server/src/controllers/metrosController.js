import { listMetros, searchPlaces } from '../lib/metros.js';

export async function getMetros(req, res) {
  try {
    const metros = await listMetros();
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(metros);
  } catch (err) {
    console.error('[metros/getMetros]', err);
    res.status(500).json({ error: 'Failed to load metro areas.' });
  }
}

export async function getMetroPlaces(req, res) {
  try {
    const q = (req.query.q ?? '').toString();
    if (!q.trim()) return res.json([]);
    const places = await searchPlaces(q, 8);
    res.json(places);
  } catch (err) {
    console.error('[metros/getMetroPlaces]', err);
    res.status(500).json({ error: 'Failed to search places.' });
  }
}

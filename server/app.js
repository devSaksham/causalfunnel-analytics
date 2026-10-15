import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';

const TYPES = new Set(['page_view', 'click']);
const MAX_BATCH = 50;

// Cached at module scope so warm serverless invocations reuse one connection pool.
let dbPromise;
export function connect(uri = process.env.MONGODB_URI) {
  if (dbPromise) return dbPromise;
  if (!uri) throw new Error('MONGODB_URI is not set');
  // Fail fast: a serverless function would otherwise hang until the gateway times out.
  dbPromise = MongoClient.connect(uri, { serverSelectionTimeoutMS: 8000 })
    .then(async (client) => {
      const db = client.db(process.env.MONGODB_DB || 'analytics');
      await db.collection('events').createIndexes([
        { key: { session_id: 1, ts: 1 } },
        { key: { page: 1, type: 1 } },
      ]);
      return db;
    })
    .catch((err) => {
      dbPromise = undefined; // retry on the next request instead of caching the failure
      throw err;
    });
  return dbPromise;
}
const events = async () => (await connect()).collection('events');
const snapshots = async () => (await connect()).collection('snapshots');

const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const num = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e6;

// Heatmaps group by page: drop query/hash, and treat /x/index.html = /x/ and /x.html = /x
// (hosts with "pretty URLs" serve the same page under both).
export const pageKey = (url) => url.origin + url.pathname.replace(/\/index\.html?$/, '/').replace(/\.html?$/, '');

// Returns a document ready to insert, or null if the event is malformed.
export function parseEvent(e) {
  if (!e || typeof e !== 'object') return null;
  if (!str(e.session_id, 100) || !TYPES.has(e.type) || !str(e.url, 2048)) return null;
  let url;
  try {
    url = new URL(e.url);
  } catch {
    return null;
  }
  const ts = new Date(e.timestamp);
  if (Number.isNaN(ts.getTime())) return null;

  const doc = {
    session_id: e.session_id,
    type: e.type,
    url: e.url,
    page: pageKey(url),
    ts,
    received_at: new Date(),
  };
  if (e.type === 'click') {
    // page_width 0 comes from hidden or zero-size viewports; it would divide by zero in the heatmap.
    if (!num(e.x) || !num(e.y) || !num(e.page_width) || e.page_width === 0) return null;
    doc.x = Math.round(e.x);
    doc.y = Math.round(e.y);
    doc.page_width = Math.round(e.page_width);
    if (num(e.viewport_width)) doc.viewport_width = Math.round(e.viewport_width);
    if (str(e.target, 200)) doc.target = e.target;
  }
  return doc;
}

export const app = express();
const api = express.Router();

// Tracker sends text/plain (sendBeacon-friendly, no CORS preflight), so parse any content type as JSON.
api.post('/events', cors(), express.json({ type: '*/*', limit: '32kb' }), async (req, res) => {
  const list = Array.isArray(req.body) ? req.body : [req.body];
  if (list.length === 0 || list.length > MAX_BATCH) return res.status(400).json({ error: `send 1-${MAX_BATCH} events` });
  const docs = list.map(parseEvent);
  if (docs.includes(null)) return res.status(400).json({ error: 'invalid event' });
  await (await events()).insertMany(docs);
  res.status(201).json({ inserted: docs.length });
});
api.options('/events', cors());

// ponytail: capped at 500 most recent sessions, add cursor pagination when traffic needs it
api.get('/sessions', async (req, res) => {
  const sessions = await (await events())
    .aggregate([
      {
        $group: {
          _id: '$session_id',
          total_events: { $sum: 1 },
          page_views: { $sum: { $cond: [{ $eq: ['$type', 'page_view'] }, 1, 0] } },
          clicks: { $sum: { $cond: [{ $eq: ['$type', 'click'] }, 1, 0] } },
          first_seen: { $min: '$ts' },
          last_seen: { $max: '$ts' },
        },
      },
      { $sort: { last_seen: -1 } },
      { $limit: 500 },
      { $project: { _id: 0, session_id: '$_id', total_events: 1, page_views: 1, clicks: 1, first_seen: 1, last_seen: 1 } },
    ])
    .toArray();
  res.json(sessions);
});

api.get('/sessions/:id/events', async (req, res) => {
  const list = await (await events())
    .find({ session_id: req.params.id }, { projection: { _id: 0, received_at: 0 } })
    .sort({ ts: 1, _id: 1 })
    .toArray();
  res.json(list);
});

api.get('/pages', async (req, res) => {
  const pages = await (await events())
    .aggregate([
      {
        $group: {
          _id: '$page',
          page_views: { $sum: { $cond: [{ $eq: ['$type', 'page_view'] }, 1, 0] } },
          clicks: { $sum: { $cond: [{ $eq: ['$type', 'click'] }, 1, 0] } },
        },
      },
      { $sort: { clicks: -1 } },
      { $project: { _id: 0, page: '$_id', page_views: 1, clicks: 1 } },
    ])
    .toArray();
  res.json(pages);
});

// ponytail: returns raw points (max 10k); bucket server-side if pages get far more clicks
api.get('/heatmap', async (req, res) => {
  const page = req.query.page;
  if (!str(page, 2048)) return res.status(400).json({ error: 'page query param required' });
  const clicks = await (await events())
    .find({ page, type: 'click' }, { projection: { _id: 0, x: 1, y: 1, page_width: 1 } })
    .sort({ ts: -1 })
    .limit(10000)
    .toArray();
  res.json(clicks);
});

// Page snapshots: the tracker posts sanitized HTML so heatmaps can be drawn over pages that forbid framing.
// One document per page (latest wins). The dashboard renders it in a sandbox with scripts disabled.
// ponytail: unauthenticated like /events, so anyone can overwrite a page's snapshot; sign tracker requests if that matters
const MAX_SNAPSHOT = 2_000_000;
api.post('/snapshots', cors(), express.json({ type: '*/*', limit: '3mb' }), async (req, res) => {
  const { url, html, width, height } = req.body || {};
  let page;
  try {
    page = pageKey(new URL(url));
  } catch {
    return res.status(400).json({ error: 'invalid url' });
  }
  if (!str(html, MAX_SNAPSHOT) || !num(width) || !num(height) || width === 0) return res.status(400).json({ error: 'invalid snapshot' });
  await (await snapshots()).updateOne(
    { _id: page },
    { $set: { html, width: Math.round(width), height: Math.round(height), captured_at: new Date() } },
    { upsert: true }
  );
  res.status(204).end();
});
api.options('/snapshots', cors());

api.get('/snapshot', async (req, res) => {
  const page = req.query.page;
  if (!str(page, 2048)) return res.status(400).json({ error: 'page query param required' });
  const doc = await (await snapshots()).findOne({ _id: page });
  if (!doc) return res.status(404).json({ error: 'no snapshot for this page yet' });
  res.json({ page, html: doc.html, width: doc.width, height: doc.height, captured_at: doc.captured_at });
});

app.use('/api', api);

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'internal error' : err.message });
});

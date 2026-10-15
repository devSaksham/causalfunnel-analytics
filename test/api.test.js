import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app, connect, pageKey } from '../server/app.js';

let mongo, server, base;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await connect(mongo.getUri());
  server = app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
});
after(async () => {
  server.close();
  await mongo.stop();
});

// Sent as text/plain, exactly like navigator.sendBeacon does.
const post = (body) => fetch(`${base}/events`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body) });
const get = (path) => fetch(base + path).then((r) => r.json());
const ev = (type, t, extra = {}) => ({ session_id: 's1', type, url: 'https://shop.test/p?a=1#x', timestamp: new Date(t).toISOString(), ...extra });

test('ingest, sessions, journey, pages, heatmap', async () => {
  assert.equal((await post(ev('page_view', 1000))).status, 201);
  // batch, deliberately out of order
  const batch = [ev('click', 3000, { x: 10, y: 20, page_width: 1200, target: 'button#buy' }), ev('click', 2000, { x: 5, y: 6, page_width: 1200 })];
  assert.equal((await post(batch)).status, 201);
  await post({ ...ev('page_view', 500), session_id: 's2' });

  const sessions = await get('/sessions');
  assert.deepEqual(sessions.map((s) => [s.session_id, s.total_events, s.clicks]), [['s1', 3, 2], ['s2', 1, 0]]);

  const journey = await get('/sessions/s1/events');
  assert.deepEqual(journey.map((e) => e.ts), [1000, 2000, 3000].map((t) => new Date(t).toISOString()));
  assert.equal(journey[2].target, 'button#buy');

  const pages = await get('/pages');
  assert.deepEqual(pages, [{ page: 'https://shop.test/p', page_views: 2, clicks: 2 }]);

  const heat = await get('/heatmap?page=' + encodeURIComponent('https://shop.test/p'));
  assert.equal(heat.length, 2);
  assert.ok(heat.every((c) => c.page_width === 1200));
});

test('page key ignores query, hash and .html variants', () => {
  const key = (u) => pageKey(new URL(u));
  assert.equal(key('https://a.test/shop/index.html?x=1#y'), 'https://a.test/shop/');
  assert.equal(key('https://a.test/shop/'), 'https://a.test/shop/');
  assert.equal(key('https://a.test/p.html'), 'https://a.test/p');
  assert.equal(key('https://a.test/p'), 'https://a.test/p');
});

test('rejects malformed events', async () => {
  for (const bad of [
    ev('scroll', 1),
    ev('click', 1), // missing coordinates
    ev('click', 1, { x: 1, y: 1, page_width: 0 }), // zero-size viewport
    { ...ev('page_view', 1), url: 'not a url' },
    { ...ev('page_view', 1), timestamp: 'nope' },
    { ...ev('page_view', 1), session_id: '' },
    [],
  ]) {
    assert.equal((await post(bad)).status, 400, JSON.stringify(bad));
  }
  const r = await fetch(`${base}/events`, { method: 'POST', body: '{broken' });
  assert.equal(r.status, 400);
  assert.equal((await fetch(`${base}/heatmap`)).status, 400);
});

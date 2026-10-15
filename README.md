# User Analytics (CausalFunnel assignment)

A small full-stack analytics app. An embeddable script records page views and clicks, an Express API stores them in MongoDB, and a React dashboard shows each session's journey and a per-page click heatmap.

- **Live dashboard:** https://causalfunnel-analytics.netlify.app
- **Demo store (tracked):** https://causalfunnel-analytics.netlify.app/demo/index.html

## Tech stack

| Part | Tech |
|---|---|
| Tracker | Vanilla JS (`public/tracker.js`), no dependencies |
| Backend | Node.js + Express 5 (`server/app.js`) |
| Database | MongoDB (Atlas in production, an in-memory MongoDB locally) |
| Dashboard | React 19 + Vite (`dashboard/`) |
| Hosting | Netlify: static dashboard/tracker/demo, with the Express app running as a Netlify Function |
| Tests | `node:test` + `mongodb-memory-server` |

## Setup

Requires Node 22.12+ (tested on Node 24).

```bash
npm install
npm run build   # builds the dashboard into dist/ (also copies tracker.js and the demo pages)
npm start       # http://localhost:3000
```

With no `MONGODB_URI`, the server starts a throwaway in-memory MongoDB, so it runs with zero setup (the first run downloads a mongod binary). To use a real database, copy `.env.example` to `.env` and set `MONGODB_URI`.

Then open http://localhost:3000/demo/index.html, click around, and watch http://localhost:3000.

- **Dashboard hot reload:** run `npm run dev` (API on :3000) and `npm run dev:dashboard` (Vite on :5173, which proxies `/api`).
- **Tests:** `npm test`

### Deploying to Netlify

```bash
netlify sites:create --name <site-name>                # or `netlify link` for an existing site
netlify env:set MONGODB_URI "<atlas connection string>" # must be set before deploying
netlify deploy --prod                                   # builds via netlify.toml
```

Atlas *Network Access* must allow `0.0.0.0/0`, because Netlify functions have no fixed IPs.

## Embedding the tracker

```html
<script src="https://<your-host>/tracker.js" defer></script>
```

Events are posted to `/api/events` on the host serving the script. Override this with `data-endpoint="https://.../api/events"`.

- **Single-page apps:** client-side route changes (`history.pushState`/`replaceState`/back) are recorded as page views when the path changes. Query-string-only changes are ignored, so search boxes do not spam views.
- **Opt-out zones:** clicks inside any element marked `data-cf-ignore` are not tracked.
- **Observing events:** every event sent is also dispatched on `window` as a `cf:event` CustomEvent, which is handy for debug panels.
- **Privacy:** a clicked element is described by its tag, id and visible text. Form fields are described by their label or placeholder only, never by what the user typed.

## Demo store

`/demo/` is a small four-page shop (home → product → cart → checkout) built to generate realistic journeys. It has:

- category filters, quick-add buttons and a promo code (`FERN20`)
- a product page driven by `?id=` with sizes, a quantity stepper, gallery thumbnails, tabs and a wishlist
- a deliberate friction point: "Add to cart" without picking a size shows an error, which is good for spotting repeated clicks
- a cart with steppers and a promo field, and a fake checkout form that sends nothing anywhere

A **test console** in the corner shows your session ID and each event as it is sent. "View in dashboard" opens `/?session=<id>` straight to your journey, and "New session" starts a fresh one. The console itself is marked `data-cf-ignore`, so clicks on it are not tracked.

Page layout lives in static HTML, because the heatmap preview renders pages without running their scripts. For the same reason the header is not sticky.

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/events` | Store one event or an array of up to 50. Body is JSON (any content type, so `sendBeacon` works) |
| `GET` | `/api/sessions` | Sessions with total events, page views, clicks, first/last seen (newest first) |
| `GET` | `/api/sessions/:id/events` | All events of a session in time order (the user journey) |
| `GET` | `/api/pages` | Tracked pages with view/click counts (feeds the heatmap page picker) |
| `GET` | `/api/heatmap?page=<url>` | Click points (`x`, `y`, `page_width`) for a page |

Event payload:

```json
{ "session_id": "uuid", "type": "click", "url": "https://shop.com/p?id=1",
  "timestamp": "2026-10-14T19:00:00.000Z", "x": 640, "y": 320,
  "page_width": 1280, "viewport_width": 1280, "target": "button#buy \"Add to cart\"" }
```

`x`, `y` and `page_width` are required for clicks. `viewport_width` and `target` are optional.

### Data model

There is one `events` collection. Each document is an event, stored as received, plus two server-side fields:

- `page`: origin + path, with the query and hash removed
- `received_at`: when the server received the event

Indexes:

- `{ session_id: 1, ts: 1 }` serves the journey query.
- `{ page: 1, type: 1 }` serves the heatmap and page queries.

Sessions are computed with an aggregation rather than stored separately. This keeps writes to a single insert.

## Assumptions and trade-offs

- **Session definition:** the session ID lives in `localStorage` and rotates after 30 minutes of inactivity, which is the common analytics convention. Sessions therefore persist across tabs and reloads. If localStorage is blocked, the session is kept in memory for the page's lifetime.
- **Transport:** the tracker uses `navigator.sendBeacon` with a `text/plain` body. Plain-text posts need no CORS preflight, and beacons survive the page unloading, so a click on a link is still recorded. If beacons are unavailable, it falls back to `fetch(..., { keepalive: true })`. The ingest endpoint allows any origin, while the read endpoints are same-origin only.
- **Heatmap accuracy:** clicks are stored as document coordinates (`pageX`/`pageY`) together with the document width. Responsive pages lay out differently per device, so the dashboard splits clicks into desktop (≥1024px), tablet and mobile views. It renders the page in an iframe at the median width for that class and scales `x` proportionally. This is exact for clicks at that width and approximate for nearby widths. Element-relative coordinates (selector + offset) would be more robust and are the next step.
- **Page preview:** the iframe is sandboxed without scripts, so previewing a page doesn't fire its own tracker. Pages on other origins, or pages that forbid framing, still show their dots on a plain grid.
- **Pages are grouped by origin + path.** Query strings and hashes are ignored, so `?utm=...` variants merge into one page. `/x/index.html` counts as `/x/`, and `/x.html` as `/x`, because hosts with "pretty URLs" (like Netlify) serve the same page under both. The full URL is still stored on each event.
- **Validation:** the event type must be on an allow-list, URL and timestamp are checked, click coordinates must be finite numbers, string lengths and batch size are capped, and the body is limited to 32 KB. Invalid events get a 400 and nothing in that batch is stored.
- **Not built (out of scope):**
  - authentication on the dashboard/API
  - rate limiting or bot filtering on ingest
  - pagination (sessions are capped at the 500 most recent, heatmap points at 10,000)
  - data retention policy
- **Serverless:** the Mongo client is cached at module scope so warm function invocations reuse one connection pool. Indexes are created on first connect.

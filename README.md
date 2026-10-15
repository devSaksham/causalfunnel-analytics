# User Analytics (CausalFunnel assignment)

A small full-stack analytics app. An embeddable script records page views and clicks, an Express API stores them in MongoDB, and a React dashboard shows each session's journey and a per-page click heatmap.

- **Live dashboard:** https://causalfunnel-analytics.netlify.app
- **Demo store (tracked):** https://causalfunnel-analytics.netlify.app/demo/index.html
- **Real site using it:** the landing page of https://jobgenie.tech (see [Embedding the tracker](#embedding-the-tracker))

## Project layout

```
public/tracker.js          embeddable tracker (copied into dist/ by the build)
public/demo/               four-page demo store + test console (demo.js)
server/app.js              Express API: validation, MongoDB access, all routes
server/index.js            local server: API + built dashboard on :3000
netlify/functions/api.mjs  the same Express app as a Netlify Function (v2)
dashboard/                 React dashboard (main.jsx, style.css)
test/api.test.js           API tests (node:test)
```

## Tech stack

| Part | Tech |
|---|---|
| Tracker | Vanilla JS (`public/tracker.js`), no dependencies |
| Backend | Node.js + Express 5 (`server/app.js`) |
| Database | MongoDB Atlas |
| Dashboard | React 19 + Vite (`dashboard/`) |
| Hosting | Netlify: static dashboard/tracker/demo, with the Express app running as a Netlify Function |
| Tests | `node:test` against Atlas, in a throwaway database per run |

## Setup

Requires Node 22.12+ (tested on Node 24) and a MongoDB Atlas cluster (the free M0 tier is enough).

1. In Atlas, create a cluster and a database user, and allow your IP under *Network Access* (`0.0.0.0/0` for Netlify).
2. Copy `.env.example` to `.env` and paste the connection string into `MONGODB_URI`.
3. Then:

```bash
npm install
npm run build   # builds the dashboard into dist/ (also copies tracker.js and the demo pages)
npm start       # http://localhost:3000
```

Data goes to the `analytics` database (override with `MONGODB_DB`). The server exits with an error if `MONGODB_URI` is not set.

Then open http://localhost:3000/demo/index.html, click around, and watch http://localhost:3000.

- **Dashboard hot reload:** run `npm run dev` (API on :3000) and `npm run dev:dashboard` (Vite on :5173, which proxies `/api`). To work on the UI against the deployed API instead, set `API_PROXY=https://causalfunnel-analytics.netlify.app` before `npm run dev:dashboard`.
- **Tests:** `npm test`. They use the same `MONGODB_URI`, but write to a throwaway `analytics_test_<timestamp>` database that is dropped when the run ends, so real data is never touched.

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
- **Scope:** `data-hosts="example.com,www.example.com"` tracks only on those hostnames (skipping staging and preview URLs), and `data-pages="/,/pricing,/blog/*"` tracks only those paths (a trailing `*` matches a prefix). Pages outside the scope send nothing: no page views, clicks or snapshots.
- **Page snapshots:** once per page per browser per day, the tracker sends a sanitized copy of the rendered HTML. Scripts, iframes, form values and `data-cf-ignore` zones are stripped, and a `<base>` tag points CSS and images back at the site. The dashboard draws the heatmap over this copy, the way Hotjar and Clarity do, so it works for any site, including ones that forbid framing and single-page apps. Pages with `data-cf-ignore` on `<html>` are never snapshotted.
- **URLs:** the `#hash` is never sent, because OAuth implicit flows put access tokens there. Add `data-strip-query` to the script tag to drop `?query` strings too. Use it on sites whose URLs can carry auth codes or personal search terms.
- **Opt-out zones:** clicks inside any element marked `data-cf-ignore` are not tracked. Putting the attribute on `<html>` (for example, while a user is signed in) pauses click tracking for the whole page, including modals rendered in portals.
- **Observing events:** every event sent is also dispatched on `window` as a `cf:event` CustomEvent, which is handy for debug panels.
- **Privacy:** a clicked element is described by its tag, id and visible text. Form fields are described by their label or placeholder only, never by what the user typed. Large containers (more than 80 characters of text, such as `div#root`) are described by tag and id only.

Example: JobGenie is a React app with sign-in. It tracks only its public landing page, only on the production domain, with no query strings recorded:

```html
<script src="https://causalfunnel-analytics.netlify.app/tracker.js"
        data-hosts="jobgenie.tech" data-pages="/" data-strip-query defer></script>
```

## Dashboard

**Overview**
- **Headline numbers:** sessions, events, events per session, clicks per page view and average session length.
- **Embed card:** the tracker snippet with a Copy button, and a link to the demo store.
- **Session depth:** one bar per recent session, with height showing its event count. Click a bar to open that session.
- **Engagement:** the share of sessions with at least one click, shown as a block grid.
- **Sessions table and User journey:** pick a session to see its events as a timeline, with page views, clicks (labelled by the element's text) and the time since the session started.
- **Deep link:** `/?session=<id>` opens a session directly. The demo's test console uses this.

**Heatmap**
- **Page picker:** tracked pages with click and view counts.
- **Device switch:** clicks are split into desktop, tablet and mobile.
- **Background:** clicks are drawn over the page's latest snapshot. Without one yet, pages on the dashboard's own site fall back to a live frame, and other sites to a dotted grid with a note.

Light and dark themes follow the system setting, and the layout works down to phone width.

## Demo store

`/demo/` is a small four-page shop (home → product → cart → checkout) built to generate realistic journeys. It has:

- category filters, quick-add buttons and a promo code (`FERN20`)
- a product page driven by `?id=` with sizes, a quantity stepper, gallery thumbnails, tabs and a wishlist
- a deliberate friction point: "Add to cart" without picking a size shows an error, which is good for spotting repeated clicks
- a cart with steppers and a promo field, and a fake checkout form that sends nothing anywhere

A **test console** in the corner shows your session ID and each event as it is sent. "View in dashboard" opens `/?session=<id>` straight to your journey, and "New session" starts a fresh one. The console itself is marked `data-cf-ignore`, so clicks on it are not tracked.

The page layout is plain HTML, so the dashboard can still render a page before its first snapshot arrives. Snapshots capture the rendered page, so a cart full of items shows up as such. The header is deliberately not sticky (see the heatmap note on fixed elements below).

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/events` | Store one event or an array of up to 50. Body is JSON (any content type, so `sendBeacon` works) |
| `GET` | `/api/sessions` | Sessions with total events, page views, clicks, first/last seen (newest first) |
| `GET` | `/api/sessions/:id/events` | All events of a session in time order (the user journey) |
| `GET` | `/api/pages` | Tracked pages with view/click counts (feeds the heatmap page picker) |
| `GET` | `/api/heatmap?page=<url>` | Click points (`x`, `y`, `page_width`) for a page |
| `POST` | `/api/snapshots` | Store a page's sanitized HTML snapshot (`url`, `html` up to 2 MB, `width`, `height`). The latest one per page wins |
| `GET` | `/api/snapshot?page=<url>` | Latest snapshot for a page (404 if none yet) |

Event payload:

```json
{ "session_id": "uuid", "type": "click", "url": "https://shop.com/p?id=1",
  "timestamp": "2026-10-14T19:00:00.000Z", "x": 640, "y": 320,
  "page_width": 1280, "viewport_width": 1280, "target": "button#buy \"Add to cart\"" }
```

`x`, `y` and a non-zero `page_width` are required for clicks. `viewport_width` and `target` are optional.

### Data model

**`events`:** one document per event, stored as received, plus two server-side fields:

- `page`: origin + path, with the query and hash removed (`/x/index.html` → `/x/`, `/x.html` → `/x`)
- `received_at`: when the server received the event

Indexes:

- `{ session_id: 1, ts: 1 }` serves the journey query.
- `{ page: 1, type: 1 }` serves the heatmap and page queries.

**`snapshots`:** one document per page, with `_id` set to the page key and the fields `html`, `width`, `height` and `captured_at`. Each new snapshot replaces the previous one.

Sessions are computed with an aggregation rather than stored separately. This keeps writes to a single insert.

## Assumptions and trade-offs

- **Session definition:** the session ID lives in `localStorage` and rotates after 30 minutes of inactivity, which is the common analytics convention. Sessions therefore persist across tabs and reloads. If localStorage is blocked, the session is kept in memory for the page's lifetime.
- **Transport:** the tracker uses `navigator.sendBeacon` with a `text/plain` body. Plain-text posts need no CORS preflight, and beacons survive the page unloading, so a click on a link is still recorded. If beacons are unavailable, it falls back to `fetch(..., { keepalive: true })`. The ingest endpoint allows any origin, while the read endpoints are same-origin only.
- **Heatmap accuracy:** clicks are stored as document coordinates (`pageX`/`pageY`) together with the document width. Responsive pages lay out differently per device, so the dashboard splits clicks into desktop (≥1024px), tablet and mobile views. It renders the page in an iframe at the median width for that class and scales `x` proportionally. This is exact for clicks at that width and approximate for nearby widths. Clicks on fixed or sticky elements, such as a sticky header after scrolling, are recorded at their scrolled position and so appear lower on the page. Element-relative coordinates (selector + offset) would fix both and are the next step.
- **Page preview:** the heatmap is drawn over the page's latest snapshot. Without one, the dashboard falls back to a live frame for its own pages and to a plain grid for other sites. Either way the frame is sandboxed without scripts, so nothing in it runs. Snapshots reflow to the width being viewed. Fonts served without CORS headers may fall back to a system font, and only the latest snapshot is kept, so a redesigned page shows old clicks over the new layout.
- **Snapshot ingest is unauthenticated,** like events: anyone can overwrite a page's snapshot. Signed tracker requests or a per-site key would close that.
- **Pages are grouped by origin + path.** Query strings and hashes are ignored, so `?utm=...` variants merge into one page. `/x/index.html` counts as `/x/`, and `/x.html` as `/x`, because hosts with "pretty URLs" (like Netlify) serve the same page under both. The full URL is still stored on each event.
- **Validation:** the event type must be on an allow-list, and URL and timestamp are checked. Click coordinates must be finite numbers, and a page width of 0 (from a hidden viewport) is rejected. String lengths and batch size are capped, and event bodies are limited to 32 KB. Invalid events get a 400 and nothing in that batch is stored. Snapshots are capped at 2 MB of HTML.
- **Not built (out of scope):**
  - authentication on the dashboard/API
  - rate limiting or bot filtering on ingest
  - pagination (sessions are capped at the 500 most recent, heatmap points at 10,000)
  - data retention policy
- **Serverless:** the Mongo client is cached at module scope so warm function invocations reuse one connection pool. Indexes are created on first connect.

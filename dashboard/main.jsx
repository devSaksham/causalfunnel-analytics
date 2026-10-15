import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

async function api(path) {
  const res = await fetch('/api' + path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// Fetches `path` whenever it or `reload` changes; path === null skips the fetch.
function useApi(path, reload) {
  const [state, setState] = useState({ data: null, error: null, loading: false });
  useEffect(() => {
    if (path === null) return setState({ data: null, error: null, loading: false });
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    api(path).then(
      (data) => live && setState({ data, error: null, loading: false }),
      (error) => live && setState({ data: null, error, loading: false })
    );
    return () => (live = false);
  }, [path, reload]);
  return state;
}

const fmtTime = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const shortPath = (url) => {
  try {
    const u = new URL(url);
    return (u.origin === location.origin ? '' : u.host) + u.pathname + u.search + u.hash;
  } catch {
    return url;
  }
};
const offset = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const sum = (xs, k) => xs.reduce((a, x) => a + x[k], 0);
// Tracker targets look like `button#buy "Add to cart"`: split into [human label, selector].
const clickLabel = (target = 'element') => {
  const m = target.match(/^(\S+) "(.*)"$/);
  return m ? [`“${m[2]}”`, m[1]] : [target, target];
};

const ICONS = {
  layers: 'M12 3 3 8l9 5 9-5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  bars: 'M5 20V10m5 10V4m5 16v-7m5 7V8',
  grid: 'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  cursor: 'M5 3l14 7-6 2-2 6L5 3Z',
};
function CardHead({ icon, title, children }) {
  return (
    <div className="card-head">
      <span className="icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d={ICONS[icon]} /></svg>
      </span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function Status({ state, empty }) {
  if (state.error) return <p className="muted error">Could not load: {state.error.message}</p>;
  if (!state.data) return <p className="muted">Loading…</p>;
  if (state.data.length === 0) return <p className="muted">{empty}</p>;
  return null;
}

function Kpis({ sessions }) {
  const n = sessions.length;
  const events = sum(sessions, 'total_events');
  const views = sum(sessions, 'page_views');
  const secs = n ? sessions.reduce((a, s) => a + (new Date(s.last_seen) - new Date(s.first_seen)), 0) / n / 1000 : 0;
  const stats = [
    ['Sessions', n, 'total'],
    ['Events tracked', events, 'all time'],
    ['Events per session', n ? (events / n).toFixed(1) : 0, 'avg'],
    ['Clicks per page view', views ? (sum(sessions, 'clicks') / views).toFixed(1) : 0, 'ratio'],
    ['Avg session length', secs >= 60 ? (secs / 60).toFixed(1) : Math.round(secs), secs >= 60 ? 'min' : 'sec'],
  ];
  return (
    <div className="kpis">
      {stats.map(([label, value, unit]) => (
        <div key={label} className="card kpi">
          <span className="label">{label}</span>
          <span className="kpi-value">
            {value}
            <small>{unit}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function EmbedCard({ pageCount }) {
  const snippet = `<script src="${location.origin}/tracker.js" defer></script>`;
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  return (
    <section className="card hero">
      <h2 className="hero-title">
        Tracking {pageCount} {pageCount === 1 ? 'page' : 'pages'}
        <br />
        in real time
      </h2>
      <p className="muted">One script tag on any site. Every page view and click lands here.</p>
      <code className="snippet">{snippet}</code>
      <div className="hero-actions">
        <button className="pill" onClick={copy}>{copied ? 'Copied ✓' : 'Copy snippet'}</button>
        <a className="pill dark" href="/demo/index.html" target="_blank" rel="noreferrer">
          Open demo store <span className="pill-icon">↗</span>
        </a>
      </div>
    </section>
  );
}

const SLOTS = 28;
function DepthCard({ sessions, selected, onSelect }) {
  const recent = sessions.slice(0, SLOTS).reverse(); // oldest on the left
  const max = Math.max(1, ...recent.map((s) => s.total_events));
  const slots = [...recent, ...Array(SLOTS - recent.length).fill(null)];
  return (
    <section className="card">
      <CardHead icon="bars" title="Session depth" />
      <div className="card-sub">
        <span>last {recent.length} sessions</span>
        <span>bar = events per session</span>
      </div>
      <div className="big">
        {max}
        <small>events, deepest session</small>
      </div>
      <div className="pills">
        {slots.map((s, i) =>
          s ? (
            <button key={s.session_id} className={`pill-bar ${s.session_id === selected ? 'on' : ''}`} title={`${s.session_id.slice(0, 8)}: ${s.total_events} events`} aria-label={`Session ${s.session_id.slice(0, 8)}, ${s.total_events} events`} onClick={() => onSelect(s.session_id)}>
              <span style={{ height: `${(s.total_events / max) * 100}%` }} />
            </button>
          ) : (
            <span key={i} className="pill-bar empty" />
          )
        )}
      </div>
      <div className="figs">
        <span><b>{sum(sessions, 'page_views')}</b> page views</span>
        <span><b>{sum(sessions, 'clicks')}</b> clicks</span>
      </div>
    </section>
  );
}

const CELLS = 24;
function EngagementCard({ sessions }) {
  const engaged = sessions.filter((s) => s.clicks > 0).length;
  const pct = sessions.length ? Math.round((engaged / sessions.length) * 100) : 0;
  const filled = Math.round((pct / 100) * CELLS);
  return (
    <section className="card">
      <CardHead icon="grid" title="Engagement" />
      <p className="muted small">Share of sessions that clicked at least once.</p>
      <div className="waffle" role="img" aria-label={`${pct}% of sessions engaged`}>
        {Array.from({ length: CELLS }, (_, i) => (
          <span key={i} className={i >= CELLS - filled ? 'on' : ''} />
        ))}
      </div>
      <div className="big">
        {pct}%<small>{engaged} of {sessions.length} engaged</small>
      </div>
    </section>
  );
}

function Overview({ reload }) {
  const sessions = useApi('/sessions', reload);
  const pages = useApi('/pages', reload);
  const [selected, setSelected] = useState(() => new URLSearchParams(location.search).get('session')); // deep link from the demo's test console
  const journey = useApi(selected && `/sessions/${encodeURIComponent(selected)}/events`, reload);
  const list = sessions.data || [];

  if (!sessions.data) return <Status state={sessions} />;
  return (
    <div className="bento">
      <Kpis sessions={list} />
      <div className="row row-a">
        <EmbedCard pageCount={pages.data?.length ?? 0} />
        <DepthCard sessions={list} selected={selected} onSelect={setSelected} />
        <EngagementCard sessions={list} />
      </div>
      <div className="row row-b">
        <section className="card">
          <CardHead icon="list" title="Sessions">
            <span className="muted small push">click a row to replay it</span>
          </CardHead>
          <Status state={sessions} empty="No sessions yet. Open the demo store and click around." />
          {list.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Session</th><th className="num">Events</th><th className="num">Views</th><th className="num">Clicks</th><th>Last seen</th></tr>
                </thead>
                <tbody>
                  {list.map((s) => (
                    <tr key={s.session_id} className={s.session_id === selected ? 'selected' : ''} onClick={() => setSelected(s.session_id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelected(s.session_id)}>
                      <td className="mono" title={s.session_id}>{s.session_id.slice(0, 8)}</td>
                      <td className="num">{s.total_events}</td>
                      <td className="num">{s.page_views}</td>
                      <td className="num">{s.clicks}</td>
                      <td className="muted">{fmtTime(s.last_seen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card">
          <CardHead icon="route" title="User journey">
            {selected && <span className="tag mono push">{selected.slice(0, 8)}</span>}
          </CardHead>
          {!selected ? (
            <p className="muted">Pick a session, or a bar in Session depth, to see its events in order.</p>
          ) : (
            <>
              <Status state={journey} empty="No events." />
              <ol className="timeline">
                {journey.data?.map((e, i) => (
                  <li key={i} className={e.type}>
                    <span className="node" aria-hidden="true" />
                    <div className="tl-body">
                      {e.type === 'page_view' ? (
                        <span className="tl-title">
                          Viewed <span className="mono">{shortPath(e.url)}</span>
                        </span>
                      ) : (
                        <>
                          <span className="tl-title">Clicked {clickLabel(e.target)[0]}</span>
                          <span className="muted small mono">
                            {clickLabel(e.target)[1]} · {shortPath(e.url)} · ({e.x}, {e.y})
                          </span>
                        </>
                      )}
                    </div>
                    <span className="tl-time mono">{offset(new Date(e.ts) - new Date(journey.data[0].ts))}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

// Responsive pages lay out differently per device, so clicks are only comparable within a width class.
const DEVICES = [
  ['desktop', 1024, Infinity],
  ['tablet', 768, 1024],
  ['mobile', 0, 768],
];
const deviceOf = (w) => DEVICES.find(([, min, max]) => w >= min && w < max)[0];

function Heatmap({ reload }) {
  const pages = useApi('/pages', reload);
  const [page, setPage] = useState('');
  const current = page || pages.data?.[0]?.page || null;
  const clicks = useApi(current && `/heatmap?page=${encodeURIComponent(current)}`, reload);
  const boxRef = useRef(null);
  const boxWidth = useWidth(boxRef);
  const [frameHeight, setFrameHeight] = useState(null);
  const [pickedDevice, setDevice] = useState(null);
  useEffect(() => setFrameHeight(null), [current]); // a new page re-measures

  const all = clicks.data || [];
  const counts = Object.fromEntries(DEVICES.map(([d]) => [d, all.filter((c) => deviceOf(c.page_width) === d).length]));
  const device = counts[pickedDevice] ? pickedDevice : DEVICES.map(([d]) => d).find((d) => counts[d] === Math.max(...Object.values(counts)));
  const points = all.filter((c) => deviceOf(c.page_width) === device);
  const snap = useApi(current && `/snapshot?page=${encodeURIComponent(current)}`, reload);
  const snapSettled = !snap.loading && (snap.data || snap.error);
  // Background, best first: the tracker's HTML snapshot (works for any site), then a live frame of our own
  // pages, else a plain grid. Other sites usually forbid framing (X-Frame-Options), so we never frame them live.
  const sameOrigin = !!current && new URL(current).origin === location.origin;
  const preview = !snapSettled ? null : snap.data ? 'snapshot' : sameOrigin ? 'live' : null;
  // Render the page at the typical width for this device class and map each click onto it.
  const W = points.length ? median(points.map((c) => c.page_width)) : snap.data?.width || 1280;
  const H = Math.max((preview && frameHeight) || 0, ...points.map((c) => c.y + 40), preview ? 600 : 360);
  const showBox = !!current && !!clicks.data && !!snapSettled && (!!preview || points.length > 0);
  const scale = boxWidth ? Math.min(1, boxWidth / W) : 1;
  const maxClicks = Math.max(1, ...(pages.data || []).map((p) => p.clicks));

  function measure(e) {
    try {
      setFrameHeight(e.target.contentDocument.documentElement.scrollHeight);
    } catch {
      setFrameHeight(null); // cross-origin page: fall back to the click extent
    }
  }

  return (
    <div className="row row-heat">
      <section className="card">
        <CardHead icon="layers" title="Pages" />
        <Status state={pages} empty="No pages tracked yet." />
        <ul className="page-list">
          {pages.data?.map((p) => (
            <li key={p.page}>
              <button className={p.page === current ? 'active' : ''} onClick={() => setPage(p.page)} aria-pressed={p.page === current}>
                <span className="mono">{shortPath(p.page)}</span>
                <span className="meter"><span style={{ width: `${(p.clicks / maxClicks) * 100}%` }} /></span>
                <span className="muted small">{p.clicks} clicks · {p.page_views} views</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <CardHead icon="cursor" title="Click heatmap">
          {all.length > 0 && (
            <div className="segmented push" role="group" aria-label="Device">
              {DEVICES.map(([d]) => (
                <button key={d} className={d === device ? 'active' : ''} disabled={!counts[d]} onClick={() => setDevice(d)}>
                  {d} <span className="count">{counts[d]}</span>
                </button>
              ))}
            </div>
          )}
        </CardHead>
        {current && !clicks.data && <Status state={clicks} />}
        {clicks.data && (
          <div className="card-sub">
            <span className="mono">{current && shortPath(current)}</span>
            <span>
              {points.length} clicks · {preview ? `rendered at ${W}px` : `${W}px wide`}
              {preview === 'snapshot' && ` · snapshot ${fmtTime(snap.data.captured_at)}`}
            </span>
          </div>
        )}
        {clicks.data && snapSettled && !preview && (
          <p className="note">
            {points.length ? 'No snapshot of this page yet, so clicks are drawn on a grid.' : 'No clicks or snapshot for this page yet.'} The tracker sends a
            snapshot on the next visit.{' '}
            <a href={current} target="_blank" rel="noreferrer">Open page ↗</a>
          </p>
        )}
        <div ref={boxRef} className="heat-box" style={{ height: showBox ? H * scale : 0 }}>
          {showBox && (
            <div className="stage" style={{ width: W, height: H, transform: `scale(${scale})` }}>
              {/* No allow-scripts: the page renders but nothing in it runs (its tracker can't fire, snapshot HTML can't act).
                  allow-same-origin only lets us measure the page height. */}
              {preview === 'snapshot' && <iframe key={'s' + current} title="Page snapshot" srcDoc={snap.data.html} sandbox="allow-same-origin" referrerPolicy="no-referrer" width={W} height={H} onLoad={measure} />}
              {preview === 'live' && <iframe key={'l' + current} title="Page preview" src={current} sandbox="allow-same-origin" width={W} height={H} onLoad={measure} />}
              {points.map((c, i) => (
                <span key={i} className="dot" style={{ left: (c.x * W) / c.page_width, top: c.y }} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState('overview');
  const [reload, setReload] = useState(0);
  return (
    <div className="shell">
      <header className="top">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Analytics</span>
        </span>
        <nav className="tabs" role="tablist">
          {[['overview', 'Overview'], ['heatmap', 'Heatmap']].map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </nav>
        <button className="pill push" onClick={() => setReload((r) => r + 1)}>Refresh</button>
      </header>
      <main>{tab === 'overview' ? <Overview reload={reload} /> : <Heatmap reload={reload} />}</main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

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

const fmtTime = (t) => new Date(t).toLocaleString();
const shortPath = (url) => {
  try {
    const u = new URL(url);
    return u.pathname + u.search + u.hash;
  } catch {
    return url;
  }
};
const offset = (ms) => {
  const s = Math.round(ms / 1000);
  return `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Status({ state, empty }) {
  if (state.error) return <p className="muted error">Could not load: {state.error.message}</p>;
  if (!state.data) return <p className="muted">Loading…</p>;
  if (state.data.length === 0) return <p className="muted">{empty}</p>;
  return null;
}

function Sessions({ reload }) {
  const sessions = useApi('/sessions', reload);
  const [selected, setSelected] = useState(null);
  const journey = useApi(selected && `/sessions/${encodeURIComponent(selected)}/events`, reload);

  return (
    <div className="split">
      <section className="panel">
        <h2>Sessions</h2>
        <Status state={sessions} empty="No sessions yet. Open the demo store and click around." />
        {sessions.data?.length > 0 && (
          <table>
            <thead>
              <tr><th>Session</th><th className="num">Events</th><th className="num">Views</th><th className="num">Clicks</th><th>Last seen</th></tr>
            </thead>
            <tbody>
              {sessions.data.map((s) => (
                <tr key={s.session_id} className={s.session_id === selected ? 'selected' : ''} onClick={() => setSelected(s.session_id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelected(s.session_id)}>
                  <td className="mono" title={s.session_id}>{s.session_id.slice(0, 8)}</td>
                  <td className="num">{s.total_events}</td>
                  <td className="num">{s.page_views}</td>
                  <td className="num">{s.clicks}</td>
                  <td>{fmtTime(s.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="panel">
        <h2>User journey</h2>
        {!selected ? (
          <p className="muted">Select a session to see its events in order.</p>
        ) : (
          <>
            <p className="muted mono">{selected}</p>
            <Status state={journey} empty="No events." />
            <ol className="journey">
              {journey.data?.map((e, i) => (
                <li key={i} className={e.type}>
                  <span className="offset mono">{offset(new Date(e.ts) - new Date(journey.data[0].ts))}</span>
                  <span className={`badge ${e.type}`}>{e.type === 'page_view' ? 'page view' : 'click'}</span>
                  <span className="detail">
                    <span className="mono">{shortPath(e.url)}</span>
                    {e.type === 'click' && (
                      <span className="muted"> · {e.target || 'element'} at ({e.x}, {e.y})</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
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

function Heatmap({ reload }) {
  const pages = useApi('/pages', reload);
  const [page, setPage] = useState('');
  const current = page || pages.data?.[0]?.page || null;
  const clicks = useApi(current && `/heatmap?page=${encodeURIComponent(current)}`, reload);
  const boxRef = useRef(null);
  const boxWidth = useWidth(boxRef);
  const [frameHeight, setFrameHeight] = useState(null);

  const points = clicks.data || [];
  // Render the page at the most common width it was clicked at, and map every click onto it.
  const W = points.length ? median(points.map((c) => c.page_width)) : 1280;
  const H = Math.max(frameHeight || 0, ...points.map((c) => c.y + 40), 600);
  const scale = boxWidth ? Math.min(1, boxWidth / W) : 1;

  function measure(e) {
    try {
      setFrameHeight(e.target.contentDocument.documentElement.scrollHeight);
    } catch {
      setFrameHeight(null); // cross-origin page: fall back to the click extent
    }
  }

  return (
    <section className="panel">
      <div className="toolbar">
        <h2>Click heatmap</h2>
        <label>
          Page{' '}
          <select value={current || ''} onChange={(e) => setPage(e.target.value)} disabled={!pages.data?.length}>
            {pages.data?.map((p) => (
              <option key={p.page} value={p.page}>{shortPath(p.page)} ({p.clicks} clicks, {p.page_views} views)</option>
            ))}
          </select>
        </label>
        {clicks.data && <span className="muted">{points.length} clicks, rendered at {W}px wide</span>}
      </div>
      <Status state={pages} empty="No pages tracked yet." />
      <div ref={boxRef} className="heat-box" style={{ height: current ? H * scale : 0 }}>
        {current && (
          <div className="stage" style={{ width: W, height: H, transform: `scale(${scale})` }}>
            {/* No allow-scripts: the page renders, but its tracker cannot fire and pollute the data. */}
            <iframe key={current} title="Page preview" src={current} sandbox="allow-same-origin" width={W} height={H} onLoad={measure} />
            {points.map((c, i) => (
              <span key={i} className="dot" style={{ left: (c.x * W) / c.page_width, top: c.y }} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function App() {
  const [tab, setTab] = useState('sessions');
  const [reload, setReload] = useState(0);
  return (
    <>
      <header className="top">
        <h1>Analytics</h1>
        <nav role="tablist">
          {['sessions', 'heatmap'].map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t === 'sessions' ? 'Sessions' : 'Heatmap'}
            </button>
          ))}
        </nav>
        <div className="actions">
          <button className="ghost" onClick={() => setReload((r) => r + 1)}>Refresh</button>
          <a className="ghost" href="/demo/index.html" target="_blank" rel="noreferrer">Open demo store ↗</a>
        </div>
      </header>
      <main>{tab === 'sessions' ? <Sessions reload={reload} /> : <Heatmap reload={reload} />}</main>
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

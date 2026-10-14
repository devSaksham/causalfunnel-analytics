/*
 * Analytics tracker. Embed on any page:
 *   <script src="https://<your-host>/tracker.js" defer></script>
 * Events go to /api/events on the host serving this script, unless overridden
 * with data-endpoint="https://.../api/events".
 */
(function () {
  var script = document.currentScript;
  var endpoint = (script && script.dataset.endpoint) || new URL('/api/events', script.src).href;
  var KEY = 'cf_session';
  var IDLE_MS = 30 * 60 * 1000; // a new session starts after 30 minutes of inactivity

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2); // non-secure contexts (plain http)
  }

  var memory; // fallback when localStorage is blocked (private mode, sandboxed iframes)
  function sessionId() {
    var now = Date.now();
    var s;
    try {
      s = JSON.parse(localStorage.getItem(KEY));
    } catch (e) {
      s = memory;
    }
    if (!s || !s.id || now - s.last > IDLE_MS) s = { id: newId() };
    s.last = now;
    memory = s;
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) {}
    return s.id;
  }

  function send(type, extra) {
    var event = { session_id: sessionId(), type: type, url: location.href, timestamp: new Date().toISOString() };
    for (var k in extra) event[k] = extra[k];
    var body = JSON.stringify(event);
    // sendBeacon posts as text/plain: no CORS preflight, and it survives page unloads (e.g. clicking a link).
    if (!(navigator.sendBeacon && navigator.sendBeacon(endpoint, body))) {
      fetch(endpoint, { method: 'POST', body: body, keepalive: true }).catch(function () {});
    }
  }

  function describe(el) {
    if (!el || !el.tagName) return undefined;
    var label = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '');
    var text = (el.innerText || el.value || el.alt || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return text ? label + ' "' + text + '"' : label;
  }

  send('page_view');

  document.addEventListener(
    'click',
    function (e) {
      var root = document.documentElement;
      send('click', {
        x: e.pageX,
        y: e.pageY,
        page_width: Math.max(root.scrollWidth, root.clientWidth),
        viewport_width: window.innerWidth,
        target: describe(e.target.closest ? e.target.closest('a,button,input,select,textarea,[id]') || e.target : e.target),
      });
    },
    true
  );
})();

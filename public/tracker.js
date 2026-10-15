/*
 * Analytics tracker. Embed on any page:
 *   <script src="https://<your-host>/tracker.js" defer></script>
 * Events go to /api/events on the host serving this script, unless overridden
 * with data-endpoint="https://.../api/events".
 * Clicks inside elements marked data-cf-ignore are not tracked.
 * Client-side route changes (history.pushState/replaceState/back) are recorded as page views.
 * Every event sent is also dispatched on window as a `cf:event` CustomEvent.
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
    // Lets the host page observe what was sent (e.g. a debug panel).
    window.dispatchEvent(new CustomEvent('cf:event', { detail: event }));
  }

  function describe(el) {
    if (!el || !el.tagName) return undefined;
    var label = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '');
    // Never read what the user typed: form fields are named by their label/placeholder, not their value.
    var isField = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !/^(submit|button|reset)$/.test(el.type);
    var text = isField
      ? (el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('aria-label') || el.placeholder || el.name || ''
      : el.getAttribute('aria-label') || el.innerText || el.value || el.alt || '';
    text = text.trim().replace(/\s+/g, ' ').slice(0, 40);
    return text ? label + ' "' + text + '"' : label;
  }

  send('page_view');

  // Single-page apps change the URL without a reload: count a new path as a page view.
  // Only the path matters, so query-string updates (search boxes, filters) don't spam views.
  var lastPath = location.pathname;
  function onRoute() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    send('page_view');
  }
  ['pushState', 'replaceState'].forEach(function (method) {
    var original = history[method];
    history[method] = function () {
      var result = original.apply(this, arguments);
      onRoute();
      return result;
    };
  });
  window.addEventListener('popstate', onRoute);

  document.addEventListener(
    'click',
    function (e) {
      if (e.target.closest && e.target.closest('[data-cf-ignore]')) return; // opt-out zones
      var root = document.documentElement;
      send('click', {
        x: e.pageX,
        y: e.pageY,
        page_width: Math.max(root.scrollWidth, root.clientWidth),
        viewport_width: window.innerWidth,
        target: describe(e.target.closest ? e.target.closest('a,button,input,select,textarea,summary,label,[role=button],[id]') || e.target : e.target),
      });
    },
    true
  );
})();

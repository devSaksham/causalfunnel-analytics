/*
 * Analytics tracker. Embed on any page:
 *   <script src="https://<your-host>/tracker.js" defer></script>
 * Events go to /api/events on the host serving this script, unless overridden
 * with data-endpoint="https://.../api/events".
 *
 * Options (attributes on the script tag):
 *   data-hosts="example.com,www.example.com"  only track on these hostnames (skips staging/preview URLs)
 *   data-pages="/,/pricing,/blog/*"           only track these paths (trailing * = prefix match)
 *   data-strip-query                          drop ?query strings from recorded URLs (auth codes, search terms)
 * URLs are never sent with their #hash. Clicks inside elements marked data-cf-ignore are not tracked.
 * Client-side route changes (history.pushState/replaceState/back) are recorded as page views.
 * Once per page per day, a sanitized HTML snapshot is sent so the dashboard can draw the heatmap over the real page.
 * Every event sent is also dispatched on window as a `cf:event` CustomEvent.
 */
(function () {
  var script = document.currentScript;
  var attr = function (name) {
    return script ? script.getAttribute(name) : null;
  };
  var stripQuery = attr('data-strip-query') !== null;
  var hosts = attr('data-hosts');
  var pages = attr('data-pages');
  var endpoint = attr('data-endpoint') || new URL('/api/events', script.src).href;
  var snapshotEndpoint = endpoint.replace(/events\/?$/, 'snapshots');
  var KEY = 'cf_session';
  var IDLE_MS = 30 * 60 * 1000; // a new session starts after 30 minutes of inactivity

  function list(value) {
    return value.split(',').map(function (s) {
      return s.trim();
    });
  }
  function tracked() {
    if (hosts && list(hosts).indexOf(location.hostname) < 0) return false;
    if (!pages) return true;
    return list(pages).some(function (p) {
      return p.slice(-1) === '*' ? location.pathname.indexOf(p.slice(0, -1)) === 0 : location.pathname === p;
    });
  }

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2); // non-secure contexts (plain http)
  }

  var memory; // fallback when localStorage is blocked (private mode, sandboxed iframes)
  function sessionId() {
    var now = Date.now();
    var s = store(KEY) || memory;
    if (!s || !s.id || now - s.last > IDLE_MS) s = { id: newId() };
    s.last = now;
    memory = s;
    store(KEY, s);
    return s.id;
  }

  function pageUrl() {
    // The #hash is never sent (OAuth implicit flows put access tokens there); data-strip-query drops ?query too.
    return location.origin + location.pathname + (stripQuery ? '' : location.search);
  }

  function send(type, extra) {
    if (!tracked()) return;
    var event = { session_id: sessionId(), type: type, url: pageUrl(), timestamp: new Date().toISOString() };
    for (var k in extra) event[k] = extra[k];
    var body = JSON.stringify(event);
    // sendBeacon posts as text/plain: no CORS preflight, and it survives page unloads (e.g. clicking a link).
    if (!(navigator.sendBeacon && navigator.sendBeacon(endpoint, body))) {
      fetch(endpoint, { method: 'POST', body: body, keepalive: true }).catch(function () {});
    }
    // Lets the host page observe what was sent (e.g. a debug panel).
    window.dispatchEvent(new CustomEvent('cf:event', { detail: event }));
  }

  // Sanitized copy of the rendered page: no scripts, no ignored zones, no form values.
  // Rendered by the dashboard in a script-less sandbox, with <base> pointing back here for CSS and images.
  function snapshot() {
    var root = document.documentElement;
    if (!tracked() || root.hasAttribute('data-cf-ignore') || !root.scrollWidth) return;
    var done = store('cf_snap') || {};
    var today = new Date().toISOString().slice(0, 10);
    if (done[location.pathname] === today) return;

    var copy = root.cloneNode(true);
    // CSS-in-JS libraries insert rules through the CSSOM, which outerHTML does not include: inline them.
    var live = document.querySelectorAll('style');
    var cloned = copy.querySelectorAll('style');
    for (var i = 0; i < live.length; i++) {
      try {
        if (!live[i].textContent && live[i].sheet) {
          cloned[i].textContent = [].map.call(live[i].sheet.cssRules, function (r) {
            return r.cssText;
          }).join('\n');
        }
      } catch (e) {}
    }
    [].forEach.call(copy.querySelectorAll('script, iframe, object, embed, link[rel=preload], link[rel=modulepreload]'), function (el) {
      el.remove();
    });
    [].forEach.call(copy.querySelectorAll('[data-cf-ignore]'), function (el) {
      el.innerHTML = '';
    });
    [].forEach.call(copy.querySelectorAll('input, textarea'), function (el) {
      el.removeAttribute('value');
      el.textContent = '';
    });
    // crossorigin/integrity would make stylesheets load in CORS mode, which most sites don't allow.
    [].forEach.call(copy.querySelectorAll('[crossorigin], [integrity]'), function (el) {
      el.removeAttribute('crossorigin');
      el.removeAttribute('integrity');
    });
    var head = copy.querySelector('head') || copy;
    var base = document.createElement('base');
    base.href = location.href.split('#')[0];
    head.insertBefore(base, head.firstChild);

    var html = '<!doctype html>' + copy.outerHTML;
    if (html.length > 2000000) return; // ponytail: skip huge pages; compress/upload as a blob if that matters
    fetch(snapshotEndpoint, {
      method: 'POST', // text/plain body: no CORS preflight
      body: JSON.stringify({ url: pageUrl(), html: html, width: root.scrollWidth, height: root.scrollHeight }),
    })
      .then(function (res) {
        if (res.ok) {
          done[location.pathname] = today;
          store('cf_snap', done);
        }
      })
      .catch(function () {});
  }
  function snapshotSoon() {
    setTimeout(snapshot, 1500); // let SPAs finish rendering
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
  if (document.readyState === 'complete') snapshotSoon();
  else window.addEventListener('load', snapshotSoon);

  // Single-page apps change the URL without a reload: count a new path as a page view.
  // Only the path matters, so query-string updates (search boxes, filters) don't spam views.
  var lastPath = location.pathname;
  function onRoute() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    send('page_view');
    snapshotSoon();
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

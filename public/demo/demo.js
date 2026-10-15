// Demo store behaviour (cart, filters, forms) plus a test console showing what the tracker sends.
// Page layout lives in static HTML on purpose: the dashboard's heatmap preview renders pages without scripts.

const PRODUCTS = {
  scarf: { name: 'Wool scarf', price: 39, color: '#b5838d', cat: 'Accessories', blurb: 'Soft merino, long enough to wrap twice.' },
  tote: { name: 'Canvas tote', price: 29, color: '#6d6875', cat: 'Accessories', blurb: 'Heavy cotton canvas with an inner pocket.' },
  beanie: { name: 'Knit beanie', price: 24, color: '#e5989b', cat: 'Accessories', blurb: 'Ribbed knit, one size, folds flat.' },
  jacket: { name: 'Rain jacket', price: 119, color: '#588157', cat: 'Outerwear', blurb: 'Lightweight, packable, and fully seam-sealed.' },
  vest: { name: 'Quilted vest', price: 89, color: '#a3b18a', cat: 'Outerwear', blurb: 'Warm core layer with recycled fill.' },
  mug: { name: 'Stoneware mug', price: 18, color: '#ddb892', cat: 'Home', blurb: 'Hand-glazed, holds a generous 12 oz.' },
  candle: { name: 'Cedar candle', price: 32, color: '#7f5539', cat: 'Home', blurb: 'Soy wax, 50-hour burn, smells like a cabin.' },
  notebook: { name: 'Linen notebook', price: 16, color: '#3a5a40', cat: 'Stationery', blurb: 'Lay-flat binding, 160 dotted pages.' },
};
const PROMOS = { FERN20: 0.2 };
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const money = (n) => '$' + n.toFixed(2);

const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};
const getCart = () => store.get('demo_cart', {});
function setCart(cart) {
  for (const id in cart) if (cart[id] <= 0) delete cart[id];
  store.set('demo_cart', cart);
  const n = Object.values(cart).reduce((a, b) => a + b, 0);
  $$('[data-cart-count]').forEach((el) => (el.textContent = n));
}
function addToCart(id, qty = 1) {
  const cart = getCart();
  cart[id] = (cart[id] || 0) + qty;
  setCart(cart);
  toast(`Added ${qty} × ${PRODUCTS[id].name}`);
}

let toastTimer;
function toast(msg) {
  let el = $('.toast');
  if (!el) document.body.append((el = Object.assign(document.createElement('div'), { className: 'toast', role: 'status' })));
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function cartTotals() {
  const cart = getCart();
  const items = Object.entries(cart).map(([id, qty]) => ({ id, qty, ...PRODUCTS[id] })).filter((i) => i.name);
  const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
  const code = store.get('demo_promo', null);
  const discount = PROMOS[code] ? subtotal * PROMOS[code] : 0;
  const shipping = subtotal - discount >= 50 || subtotal === 0 ? 0 : 6;
  return { items, subtotal, code, discount, shipping, total: subtotal - discount + shipping };
}
function renderSummary(root) {
  const t = cartTotals();
  root.innerHTML = `
    <div class="sum-row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
    ${t.discount ? `<div class="sum-row"><span>Promo ${t.code}</span><span>−${money(t.discount)}</span></div>` : ''}
    <div class="sum-row"><span>Shipping</span><span>${t.shipping ? money(t.shipping) : 'Free'}</span></div>
    <div class="sum-row total"><span>Total</span><span>${money(t.total)}</span></div>`;
  return t;
}

// ---- Shared ----
document.addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) addToCart(add.dataset.add);
  if (e.target.closest('[data-dismiss]')) e.target.closest('[data-dismiss]').parentElement.remove();
});
$('.search')?.addEventListener('submit', (e) => {
  e.preventDefault();
  toast('Search is decorative in this demo');
});

// ---- Pages ----
const pages = {
  home() {
    $$('.chip').forEach((chip) =>
      chip.addEventListener('click', () => {
        $$('.chip').forEach((c) => c.setAttribute('aria-pressed', c === chip));
        $$('.grid .card').forEach((card) => card.classList.toggle('hidden', chip.dataset.filter !== 'all' && card.dataset.cat !== chip.dataset.filter));
      })
    );
    $('#copy-code').addEventListener('click', () => {
      navigator.clipboard?.writeText('FERN20');
      toast('Code FERN20 copied');
    });
    $('#newsletter').addEventListener('submit', (e) => {
      e.preventDefault();
      e.target.innerHTML = '<p>Thanks! (Demo: nothing was sent.)</p>';
    });
  },

  product() {
    const id = new URLSearchParams(location.search).get('id');
    const p = PRODUCTS[id];
    if (p) {
      document.title = `${p.name} | Fern & Co. (demo)`;
      $('#p-name').textContent = p.name;
      $('#p-crumb').textContent = p.name;
      $('#p-cat').textContent = p.cat;
      $('#p-price').textContent = money(p.price);
      $('#p-blurb').textContent = p.blurb;
      $('.product').style.setProperty('--c', p.color);
    }
    const productId = p ? id : 'jacket'; // the static markup is the jacket
    $$('.related .card').forEach((card) => card.classList.toggle('hidden', card.dataset.id === productId));
    $$('.thumb').forEach((t, i) =>
      t.addEventListener('click', () => {
        $$('.thumb').forEach((x) => x.setAttribute('aria-pressed', x === t));
        $('.gallery-main').style.filter = `brightness(${1 - i * 0.12})`;
      })
    );
    let size = null;
    $$('.size').forEach((b) =>
      b.addEventListener('click', () => {
        size = b.textContent;
        $$('.size').forEach((x) => x.setAttribute('aria-pressed', x === b));
        $('#size-error').classList.add('hidden');
      })
    );
    let qty = 1;
    const out = $('#qty');
    $('#qty-minus').addEventListener('click', () => (out.value = qty = Math.max(1, qty - 1)));
    $('#qty-plus').addEventListener('click', () => (out.value = qty = Math.min(9, qty + 1)));
    $('#add-to-cart').addEventListener('click', () => {
      if (!size) return $('#size-error').classList.remove('hidden'); // deliberate friction: good for testing rage clicks
      addToCart(productId, qty);
    });
    $('#wishlist').addEventListener('click', (e) => {
      const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', on);
      e.currentTarget.textContent = on ? '♥' : '♡';
    });
    $$('.tab').forEach((tab) =>
      tab.addEventListener('click', () => {
        $$('.tab').forEach((t) => t.setAttribute('aria-selected', t === tab));
        $$('.panel').forEach((pnl) => (pnl.hidden = pnl.id !== tab.getAttribute('aria-controls')));
      })
    );
  },

  cart() {
    const list = $('#cart-lines');
    const render = () => {
      const t = renderSummary($('#summary'));
      $('#checkout').toggleAttribute('disabled', t.items.length === 0);
      list.innerHTML = t.items.length
        ? t.items
            .map(
              (i) => `
          <div class="line">
            <div class="swatch" style="--c:${i.color}"></div>
            <div><a href="product.html?id=${i.id}"><b>${i.name}</b></a><div class="muted">${money(i.price)}</div><button class="remove" data-remove="${i.id}">Remove</button></div>
            <div class="stepper"><button data-dec="${i.id}" aria-label="Decrease">−</button><output>${i.qty}</output><button data-inc="${i.id}" aria-label="Increase">+</button></div>
            <b>${money(i.price * i.qty)}</b>
          </div>`
            )
            .join('')
        : '<div class="empty"><p class="muted">Your cart is empty.</p><a class="btn" href="index.html#shop">Browse the shop</a></div>';
    };
    list.addEventListener('click', (e) => {
      const cart = getCart();
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.inc) cart[b.dataset.inc]++;
      if (b.dataset.dec) cart[b.dataset.dec]--;
      if (b.dataset.remove) delete cart[b.dataset.remove];
      setCart(cart);
      render();
    });
    $('#promo-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = $('#promo').value.trim().toUpperCase();
      store.set('demo_promo', PROMOS[code] ? code : null);
      toast(PROMOS[code] ? `${code} applied` : 'That code does not exist (try FERN20)');
      render();
    });
    $('#checkout').addEventListener('click', () => (location.href = 'checkout.html'));
    render();
  },

  checkout() {
    const t = renderSummary($('#summary'));
    $('#items').textContent = t.items.map((i) => `${i.qty} × ${i.name}`).join(', ') || 'No items, add something first.';
    $('#place-order').toggleAttribute('disabled', t.items.length === 0);
    $('#checkout-form').addEventListener('submit', (e) => {
      e.preventDefault(); // demo: nothing is sent anywhere
      setCart({});
      store.set('demo_promo', null);
      $('#checkout-view').classList.add('hidden');
      $('#success').classList.remove('hidden');
      $('#order-no').textContent = 'FC-' + Math.floor(10000 + Math.random() * 89999);
    });
  },
};

setCart(getCart()); // paint the cart badge
pages[document.body.dataset.page]?.();

// ---- Test console ----
(() => {
  const el = document.createElement('aside');
  el.className = 'tc';
  el.setAttribute('data-cf-ignore', '');
  el.setAttribute('aria-label', 'Tracking test console');
  el.innerHTML = `
    <button class="tc-toggle" aria-expanded="false"><span class="tc-dot"></span>Tracking · <span data-sid>…</span> · <span data-n>0</span> events</button>
    <div class="tc-body" hidden>
      <ol class="tc-log"></ol>
      <div class="tc-actions"><a data-open target="_blank" rel="noreferrer">View in dashboard ↗</a><button data-reset>New session</button></div>
      <p class="tc-note">Clicks inside this panel are not tracked (data-cf-ignore).</p>
    </div>`;
  document.body.append(el);
  const body = $('.tc-body', el);
  const open = store.get('demo_tc_open', false);
  const setOpen = (v) => {
    body.hidden = !v;
    $('.tc-toggle', el).setAttribute('aria-expanded', v);
    store.set('demo_tc_open', v);
  };
  setOpen(open);
  $('.tc-toggle', el).addEventListener('click', () => setOpen(body.hidden));
  $('[data-reset]', el).addEventListener('click', () => {
    localStorage.removeItem('cf_session'); // tracker's storage key
    location.reload();
  });
  let n = 0;
  window.addEventListener('cf:event', ({ detail: ev }) => {
    $('[data-sid]', el).textContent = ev.session_id.slice(0, 8);
    $('[data-n]', el).textContent = ++n;
    $('[data-open]', el).href = '/?session=' + encodeURIComponent(ev.session_id);
    const li = document.createElement('li');
    const what = ev.type === 'click' ? `${ev.target || 'element'} @${ev.x},${ev.y}` : new URL(ev.url).pathname + new URL(ev.url).search;
    li.innerHTML = `<span class="t ${ev.type}"></span><span class="d"></span>`;
    li.firstChild.textContent = ev.type === 'click' ? 'click' : 'view';
    li.lastChild.textContent = what;
    li.lastChild.title = what;
    $('.tc-log', el).prepend(li);
  });
})();

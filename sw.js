/* ── SỔ QUỸ — Service Worker ── */
// Cache key = ngày SW được install, tự invalidate khi cashbook.html thay đổi
const CACHE = 'cashbook-' + new Date().toISOString().slice(0, 10);
const PRECACHE = ['./cashbook.html', './manifest.json'];

/* ── INSTALL: precache shell ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

/* ── ACTIVATE: drop old caches ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── FETCH ── */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* icon.png — generated via OffscreenCanvas, no file needed */
  if (url.pathname.endsWith('/icon.png')) {
    e.respondWith(makeIcon(512));
    return;
  }

  /* external APIs (GitHub, Anthropic, Google Fonts) — network only, no cache */
  const isExternal =
    url.hostname.includes('github') ||
    url.hostname.includes('anthropic') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('kiotviet');
  if (isExternal) {
    e.respondWith(fetch(e.request).catch(() =>
      new Response(JSON.stringify({ error: 'offline' }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      })
    ));
    return;
  }

  /* own assets — cache-first, update in background */
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);
      const networkFetch = fetch(e.request).then(res => {
        if (res.ok) { cache.put(e.request, res.clone()); }
        return res;
      }).catch(() => null);
      return cached || networkFetch;
    })
  );
});

/* ── ICON GENERATOR (OffscreenCanvas) ── */
async function makeIcon(size) {
  try {
    const cv = new OffscreenCanvas(size, size);
    const cx = cv.getContext('2d');
    const r = size * 0.22;
    /* rounded rect background */
    cx.fillStyle = '#1A6B3C';
    cx.beginPath();
    cx.moveTo(r, 0); cx.lineTo(size - r, 0);
    cx.quadraticCurveTo(size, 0, size, r);
    cx.lineTo(size, size - r);
    cx.quadraticCurveTo(size, size, size - r, size);
    cx.lineTo(r, size);
    cx.quadraticCurveTo(0, size, 0, size - r);
    cx.lineTo(0, r);
    cx.quadraticCurveTo(0, 0, r, 0);
    cx.closePath();
    cx.fill();
    /* text */
    cx.fillStyle = '#fff';
    cx.font = 'bold ' + Math.round(size * 0.38) + 'px sans-serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText('SQ', size / 2, size / 2);
    const blob = await cv.convertToBlob({ type: 'image/png' });
    return new Response(blob, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public,max-age=604800' },
    });
  } catch (_) {
    /* fallback: 1×1 transparent PNG */
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=';
    const raw = atob(b64);
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) { buf[i] = raw.charCodeAt(i); }
    return new Response(buf, { headers: { 'Content-Type': 'image/png' } });
  }
}

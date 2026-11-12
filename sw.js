// Service worker: keeps the app, the Firebase code and every attachment picture on the phone,
// so the trip opens without internet (subway, plane).
// Change VERSION when you publish an update so phones pick up the new files.
const VERSION = 'v4';
const SHELL = `tp-shell-${VERSION}`;
const LIBS = 'tp-libs';
const FILES = 'tp-files';

const SHELL_FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/config.js', 'js/derived.js', 'js/files.js', 'js/phrases.js', 'js/state.js', 'js/store.js', 'js/ui.js', 'js/util.js',
  'js/views-more.js', 'js/views-plan.js', 'js/views-trip.js',
  'icons/icon-192.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tp-shell-') && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const LIB_HOSTS = ['www.gstatic.com', 'unpkg.com', 'cdnjs.cloudflare.com'];
const FILE_HOSTS = ['firebasestorage.googleapis.com'];

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App files: answer from the phone right away, refresh in the background.
  if (url.origin === self.location.origin) {
    if (url.search && req.mode === 'navigate') {
      // Shared place from Google Maps (?text=...): serve the app page.
      e.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
      return;
    }
    e.respondWith(caches.open(SHELL).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // Libraries (Firebase, map, PDF reader) and attachment pictures: keep forever once downloaded.
  const bucket = LIB_HOSTS.includes(url.hostname) ? LIBS : FILE_HOSTS.includes(url.hostname) ? FILES : null;
  if (!bucket) return; // weather, map tiles, database: normal internet
  e.respondWith(caches.open(bucket).then(async (cache) => {
    const hit = await cache.match(req.url);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') cache.put(req.url, res.clone());
    return res;
  }));
});

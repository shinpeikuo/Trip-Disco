// App start-up, screen switching (the part after # in the address) and the header / tab bar.
import { store } from './store.js';
import { state, hooks, device, go } from './state.js';
import { esc, clock, clockDay, FLAG, HOME, refreshWeather, parseMapsInput } from './util.js';
import { decorate, currentCity } from './derived.js';
import { cacheAttachments } from './files.js';
import { toast } from './ui.js';
import * as T from './views-trip.js';
import * as P from './views-plan.js';
import * as X from './views-more.js';

// [address pattern, screen, options]. trip:false = works without an open trip.
const routes = [
  [/^#\/?$/, () => go(state.code ? '#/now' : '#/trips'), { trip: false }],
  [/^#\/trips$/, T.trips, { trip: false }],
  [/^#\/join(?:\/([\w-]+))?$/, T.join, { trip: false }],
  [/^#\/create$/, T.create, { trip: false }],
  [/^#\/pick$/, T.pick, { trip: false }],
  [/^#\/settings$/, T.settings],
  [/^#\/now$/, P.now],
  [/^#\/plan(?:\/(\d{4}-\d\d-\d\d))?$/, P.plan],
  [/^#\/map\/(\d{4}-\d\d-\d\d)$/, P.map],
  [/^#\/event\/([\w-]+)$/, P.eventView],
  [/^#\/edit\/([\w-]+)(?:\/(\d{4}-\d\d-\d\d))?$/, P.eventEdit],
  [/^#\/file\/([\w-]+)\/(\d+)$/, P.fileView],
  [/^#\/shared$/, P.shared],
  [/^#\/wish$/, X.wish],
  [/^#\/wish-edit\/([\w-]+)$/, X.wishEdit],
  [/^#\/more$/, X.more],
  [/^#\/hotels$/, X.hotels],
  [/^#\/hotel\/([\w-]+)$/, X.hotelCard],
  [/^#\/hotel-edit\/([\w-]+)$/, X.hotelEdit],
  [/^#\/money$/, X.money],
  [/^#\/phrases(?:\/(ja|zh))?$/, X.phrases],
  [/^#\/packing$/, X.packing],
  [/^#\/time$/, X.time],
];

let current = null;
let unsubs = [];
let tripLoaded = false;

function openTrip(code) {
  for (const u of unsubs) u();
  unsubs = [];
  const entry = device.list().find((t) => t.code === code);
  if (!entry) return false;
  Object.assign(state, { code, me: entry.me, trip: null, events: [], wish: [], hotels: [], packing: null });
  tripLoaded = false;
  device.setCurrent(code);
  const P0 = ['trips', code];
  unsubs = [
    store.watch(P0, (d) => {
      state.trip = d; tripLoaded = true;
      if (d) {
        device.save({ ...entry, me: state.me, name: d.name, startDate: d.startDate, endDate: d.endDate });
        decorate();
        refreshWeather(d).then((changed) => changed && refresh());
      }
      refresh();
    }),
    store.watch([...P0, 'events'], (a) => { state.events = a; decorate(); cacheAttachments(a); refresh(); schedulePins(); }),
    store.watch([...P0, 'wishlist'], (a) => { state.wish = a; refresh(); schedulePins(); }),
    store.watch([...P0, 'hotels'], (a) => { state.hotels = a; refresh(); }),
    store.watch([...P0, 'packing', entry.me], (d) => { state.packing = d; refresh(); }),
  ];
  return true;
}
function closeTrip() {
  for (const u of unsubs) u();
  unsubs = [];
  Object.assign(state, { code: null, me: null, trip: null, events: [], wish: [], hotels: [], packing: null });
}
hooks.openTrip = openTrip;
hooks.closeTrip = closeTrip;

let pinTimer = null;
const schedulePins = () => { clearTimeout(pinTimer); pinTimer = setTimeout(P.pinMissing, 3000); };

let refreshTimer = null;
// Redraw the screen when shared data changes. Whatever box you were typing in keeps its text and cursor.
function refresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (!current?.view?.live) return;
    const a = document.activeElement;
    const typing = a?.id && a.closest?.('#main') && a.matches('input:not([type=checkbox]), textarea');
    const keep = typing ? { id: a.id, value: a.value, start: a.selectionStart ?? null } : null;
    render(true);
    if (!keep) return;
    const b = document.getElementById(keep.id);
    if (!b) return;
    b.value = keep.value;
    b.dispatchEvent(new Event('input'));
    b.focus({ preventScroll: true });
    try { if (keep.start != null) b.setSelectionRange(keep.start, keep.start); } catch { /* number inputs have no cursor position */ }
  }, 40);
}
hooks.refresh = refresh;
hooks.refreshView = () => render(true);

function render(keepScroll = false) {
  const hash = location.hash || '#/';
  for (const [re, fn, opt = {}] of routes) {
    const m = hash.match(re);
    if (!m) continue;
    if (opt.trip !== false) {
      if (!state.code) { go('#/trips'); return; }
      if (!state.trip) {
        paint({ title: 'Loading…', live: true, html: tripLoaded ? T.missingTrip() : '<p class="center muted big">Loading your trip…</p>' }, keepScroll);
        return;
      }
    }
    const v = fn(...m.slice(1));
    if (v) paint(v, keepScroll);
    return;
  }
  go('#/');
}

function paint(v, keepScroll) {
  const scroll = window.scrollY;
  current = { view: v };
  document.title = v.title ? `${v.title} · Family Trip` : 'Family Trip';
  document.body.classList.toggle('full', !!v.full);
  document.getElementById('top').innerHTML = v.full ? '' : header(v);
  document.getElementById('main').innerHTML = v.html;
  document.getElementById('nav').innerHTML = v.full || !state.code || !v.tab ? '' : nav(v.tab);
  v.mount?.(document.getElementById('main'));
  window.scrollTo(0, keepScroll ? scroll : 0);
}

function header(v) {
  const back = v.back ? `<a class="back" href="${esc(v.back)}" aria-label="Back">‹</a>` : '';
  let clocks = '';
  if (state.trip && !v.noClock) {
    const here = currentCity();
    const tz = here.tz === HOME.tz ? (state.trip.cities.find((c) => c.tz !== HOME.tz) || here) : here;
    const name = here.tz === HOME.tz ? tz.name : here.name;
    clocks = `<a class="clocks" href="#/time">${FLAG[tz.tz] || '🌏'} ${esc(name)} <b>${clock(tz.tz)}</b> ${clockDay(tz.tz)}<span class="sep">·</span>🇺🇸 Dallas <b>${clock(HOME.tz)}</b> ${clockDay(HOME.tz)}</a>`;
  }
  const offline = navigator.onLine ? '' : '<span class="pill offline">Offline</span>';
  const preview = store.mode === 'local' ? '<span class="pill preview" title="Saved on this device only">Preview</span>' : '';
  return `<header class="bar">${back}<h1>${esc(v.title || 'Family Trip')}</h1>${offline}${preview}</header>${clocks}`;
}

function nav(tab) {
  const item = (id, href, icon, label) => `<a href="${href}" class="${tab === id ? 'on' : ''}"><span>${icon}</span>${label}</a>`;
  return item('now', '#/now', '🏠', 'Now') + item('plan', '#/plan', '📅', 'Plan') + item('wish', '#/wish', '⭐', 'Wishlist') + item('more', '#/more', '☰', 'More');
}

// A place shared from Google Maps (Android "Share" menu) arrives as ?title=&text=&url=
function takeSharedPlace() {
  const q = new URLSearchParams(location.search);
  if (!q.has('text') && !q.has('url') && !q.has('title')) return;
  const lines = [...new Set([q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n').split('\n').map((s) => s.trim()).filter(Boolean))];
  state.prefill = parseMapsInput(lines.join('\n'));
  history.replaceState(null, '', location.pathname + '#/shared');
}

async function start() {
  try {
    await store.init();
  } catch (e) {
    console.error(e);
    document.getElementById('main').innerHTML = '<div class="card"><h2>Could not start</h2><p>The app needs the internet the very first time it opens. Connect to Wi-Fi and reload.</p></div>';
    return;
  }
  takeSharedPlace();
  const cur = device.current();
  if (cur) openTrip(cur);
  window.addEventListener('hashchange', () => render());
  window.addEventListener('online', () => { render(true); if (state.trip) refreshWeather(state.trip).then(() => refresh()); cacheAttachments(state.events); });
  window.addEventListener('offline', () => render(true));
  window.addEventListener('tp-error', (e) => toast('Could not save: ' + e.detail, 5000));
  setInterval(() => { if (current?.view?.live && !current.view.noTick && !document.querySelector('.modal-wrap')) render(true); }, 30000);
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
}

start();

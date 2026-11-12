// Now & Next, the daily plan, the map, event details / editing, attachments viewer.
import { state, go, hooks, memberName, meName } from './state.js';
import { store } from './store.js';
import { esc, uid, clone, clean, tripDays, dayLabel, todayIn, timeText, fmt12, countdown, clock, clockDay, HOME, ROUGH, cityOf,
  mapsLink, parseMapsInput, geocode, weatherFor, loadScript, loadCss, eventTz } from './util.js';
import { dayEvents, dayCity, currentCity, nowNext, hotelTonight } from './derived.js';
import { processAttachment, deleteAttachment, pictureUrls } from './files.js';
import { toast, confirmBox } from './ui.js';

const linkify = (s) => esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u.length > 45 ? u.slice(0, 42) + '…' : u}</a>`);
const ext = (href, label, cls = 'btn') => (href ? `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener">${label}</a>` : '');
const findEvent = (id) => state.events.find((e) => e.id === id);
const notFound = (back) => ({ title: 'Not found', back, html: '<div class="card"><p>This item was deleted.</p></div>' });

function wxLine(city, date) {
  const w = weatherFor(city, date);
  if (!w) return '';
  return `${w.icon} ${esc(w.text)} · <b>${w.hi}°</b> / ${w.lo}°F${w.rain != null ? ` · ${w.rain}% rain` : ''}`;
}

function defaultDay() {
  const days = tripDays(state.trip);
  const today = todayIn(currentCity().tz);
  return days.includes(today) ? today : days[0] || today;
}

// ---------- Now & Next ----------
export function now() {
  const t = state.trip;
  const { current, next, reminders } = nowNext(state.me);
  const here = currentCity();
  const today = todayIn(here.tz);
  const homeToday = todayIn(HOME.tz);
  const wx = weatherFor(here.name, today);
  const hotel = hotelTonight();

  let banner = '';
  if (homeToday < t.startDate) {
    const days = Math.round((new Date(t.startDate) - new Date(homeToday)) / 86400000);
    banner = `<div class="banner">✈️ Trip starts in <b>${days} day${days === 1 ? '' : 's'}</b></div>`;
  } else if (homeToday > t.endDate && today > t.endDate) {
    banner = `<div class="banner">🏡 Welcome home! This trip is over. <a href="#/plan">See the plan</a></div>`;
  }

  const card = (e, kind) => {
    if (!e) return '';
    const sameDay = e.date === todayIn(eventTz(t, e));
    const when = kind === 'next' ? countdown(e._start) : (e.timeLabel || 'started ' + fmt12(e.time));
    const loc = e.location || {};
    const att = e.attachments?.length ? `<a class="btn" href="#/file/${esc(e.id)}/0">🎫 ${e.attachments.length > 1 ? 'Tickets' : 'Ticket'}</a>` : '';
    return `<section class="nn ${kind}${e.important ? ' important' : ''}">
      <div class="nn-label">${kind === 'now' ? 'Now' : 'Next'} <span>${esc(when)}</span></div>
      <a class="nn-title" href="#/event/${esc(e.id)}">${esc(e.title)}</a>
      <div class="nn-time">${sameDay ? '' : esc(dayLabel(e.date)) + ' · '}${esc(timeText(e))}${e.city && e.city !== here.name ? ' · ' + esc(e.city) : ''}</div>
      ${loc.name || loc.address ? `<div class="nn-place">📍 ${esc(loc.name || '')}${loc.address ? `<small>${esc(loc.address)}</small>` : ''}</div>` : ''}
      ${e.transit ? `<div class="transit">🚆 ${linkify(e.transit)}</div>` : ''}
      <div class="btn-row">${ext(mapsLink(e.location), '🗺️ Directions', 'btn primary')}${att}<a class="btn" href="#/event/${esc(e.id)}">Details</a></div>
    </section>`;
  };

  return {
    title: t.name, tab: 'now', live: true,
    html: `
      <div class="hello">Hi ${esc(meName())} 👋</div>
      ${banner}
      ${reminders.map((e) => `<a class="reminder" href="#/event/${esc(e.id)}">⏰ <b>${esc(e.title)}</b> ${esc(countdown(e._start))}</a>`).join('')}
      <div class="today">
        <div><div class="today-city">${esc(here.name)}</div><div class="today-clock">${clock(here.tz)} <small>${clockDay(here.tz)}</small></div>
        ${here.tz !== HOME.tz ? `<div class="muted">Dallas ${clock(HOME.tz)} ${clockDay(HOME.tz)}</div>` : ''}</div>
        ${wx ? `<div class="today-wx"><div class="wx-icon">${wx.icon}</div><div><b>${wx.hi}°</b> / ${wx.lo}°F</div><div class="muted small">${esc(wx.text)}</div></div>` : ''}
      </div>
      ${card(current, 'now')}
      ${card(next, 'next')}
      ${!current && !next ? '<div class="card center"><p class="big">Nothing else planned.</p><a class="btn primary" href="#/plan">See the plan</a></div>' : ''}
      <div class="tiles">
        <a class="tile" href="${hotel ? `#/hotel/${esc(hotel.id)}` : '#/hotels'}"><span>🏨</span>Hotel card</a>
        <a class="tile" href="#/money"><span>💱</span>Money</a>
        <a class="tile" href="#/phrases"><span>🗣️</span>Phrases</a>
        ${t.photosUrl ? `<a class="tile" href="${esc(t.photosUrl)}" target="_blank" rel="noopener"><span>📷</span>Photos</a>` : '<a class="tile" href="#/packing"><span>🧳</span>Packing</a>'}
      </div>`,
  };
}

// ---------- Daily plan ----------
export function plan(day) {
  const t = state.trip;
  const days = tripDays(t);
  const d = day || defaultDay();
  const idx = days.indexOf(d);
  const city = dayCity(d);
  const evs = dayEvents(d);
  const nowMs = Date.now();
  let lastCity = city;
  const rows = evs.map((e) => {
    const showCity = e.city && e.city !== lastCity;
    if (e.city) lastCity = e.city;
    const live = e._start <= nowMs && (e._end || e._start + 3600e3) > nowMs;
    const who = e.attendees?.length ? e.attendees.map(memberName).join(', ') : '';
    const bits = [
      e.location?.name ? '📍 ' + esc(e.location.name) : '',
      e.transit ? '🚆' : '',
      e.attachments?.length ? '📎' : '',
      who ? '👤 ' + esc(who) : '',
    ].filter(Boolean).join(' · ');
    return `<li><a href="#/event/${esc(e.id)}" class="ev${e.important ? ' important' : ''}${live ? ' live' : ''}${e._end && e._end < nowMs || (!e._end && e._start + 3600e3 < nowMs) ? ' past' : ''}">
      <span class="ev-time">${esc(timeText(e))}</span>
      <span class="ev-main">${showCity ? `<span class="city-tag">→ ${esc(e.city)}</span>` : ''}<b>${e.important ? '⭐ ' : ''}${esc(e.title)}</b>${bits ? `<small>${bits}</small>` : ''}</span></a></li>`;
  }).join('');

  return {
    title: 'Plan', tab: 'plan', live: true,
    html: `
      <div class="days" id="days">${days.map((x, i) => `<a class="chip${x === d ? ' on' : ''}" href="#/plan/${x}"><b>Day ${i + 1}</b><span>${esc(dayLabel(x, { weekday: 'short' }))} ${esc(dayLabel(x, { month: 'numeric', day: 'numeric' }))}</span></a>`).join('')}</div>
      <div class="day-head">
        <h2>${esc(dayLabel(d, { weekday: 'long', month: 'long', day: 'numeric' }))}</h2>
        <div>📍 ${esc(city)}${weatherFor(city, d) ? ' · ' + wxLine(city, d) : ''}</div>
      </div>
      <div class="toolbar">
        <label class="who">Showing <select id="who"><option value="all">Everyone</option>${t.members.map((m) => `<option value="${esc(m.id)}" ${state.filter === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
        <a class="btn" href="#/map/${d}">🗺️ Map</a>
        <a class="btn primary" href="#/edit/new/${d}">+ Add</a>
      </div>
      ${rows ? `<ol class="timeline">${rows}</ol>` : `<div class="card center muted">Nothing planned${state.filter !== 'all' ? ' for ' + esc(memberName(state.filter)) : ''} on this day yet.</div>`}
      <div class="btn-row pager">
        ${idx > 0 ? `<a class="btn" href="#/plan/${days[idx - 1]}">‹ ${esc(dayLabel(days[idx - 1], { weekday: 'short' }))}</a>` : '<span></span>'}
        ${idx >= 0 && idx < days.length - 1 ? `<a class="btn" href="#/plan/${days[idx + 1]}">${esc(dayLabel(days[idx + 1], { weekday: 'short' }))} ›</a>` : ''}
      </div>`,
    mount(el) {
      const on = el.querySelector('.chip.on');
      if (on) el.querySelector('#days').scrollLeft = on.offsetLeft - 16;
      el.querySelector('#who').addEventListener('change', (ev) => {
        state.filter = ev.target.value;
        try { localStorage.setItem('tp.filter', JSON.stringify(state.filter)); } catch { /* ignore */ }
        hooks.refreshView();
      });
    },
  };
}

// ---------- Map (online only) ----------
export function map(d) {
  const evs = dayEvents(d).filter((e) => e.location?.lat != null);
  return {
    title: 'Map · ' + dayLabel(d), back: '#/plan/' + d, live: false,
    html: `<div id="map" class="map">${navigator.onLine ? '<p class="center muted">Loading map…</p>' : '<p class="center big">The map needs the internet.</p>'}</div>
      ${evs.length ? '' : '<p class="center muted">No places with a map pin on this day. Add an address to a plan to pin it.</p>'}`,
    async mount(el) {
      if (!navigator.onLine) return;
      try {
        loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
        await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
      } catch { el.querySelector('#map').innerHTML = '<p class="center">Could not load the map.</p>'; return; }
      const L = window.L;
      const box = el.querySelector('#map');
      box.innerHTML = '';
      const m = L.map(box);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
      const pts = [];
      evs.forEach((e, i) => {
        const ll = [e.location.lat, e.location.lng];
        pts.push(ll);
        L.marker(ll, { icon: L.divIcon({ className: 'pin', html: `<span>${i + 1}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] }) })
          .addTo(m)
          .bindPopup(`<b>${i + 1}. ${esc(e.title)}</b><br>${esc(timeText(e))}<br><a href="${esc(mapsLink(e.location, e.title))}" target="_blank" rel="noopener">Open in Google Maps</a>`);
      });
      if (pts.length) m.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
      else { const c = cityOf(state.trip, dayCity(d)); m.setView(c?.lat != null ? [c.lat, c.lon] : [35, 135], 11); }
    },
  };
}

// ---------- Event details ----------
export function eventView(id) {
  const e = findEvent(id);
  if (!e) return notFound('#/plan');
  const loc = e.location || {};
  const tz = eventTz(state.trip, e);
  const who = e.attendees?.length ? e.attendees.map(memberName).join(', ') : 'Everyone';
  const lead = e.reminderMins >= 1440 ? `${e.reminderMins / 1440} day` : e.reminderMins >= 60 ? `${e.reminderMins / 60} h` : `${e.reminderMins || 60} min`;
  return {
    title: e.title, back: '#/plan/' + e.date, live: true,
    html: `<article class="card detail${e.important ? ' important' : ''}">
      ${e.important ? `<div class="badge">⭐ Important · reminder ${esc(lead)} before</div>` : ''}
      <h2 class="detail-title">${esc(e.title)}</h2>
      <p class="big">${esc(dayLabel(e.date, { weekday: 'long', month: 'long', day: 'numeric' }))}<br><b>${esc(timeText(e))}</b>${e.city ? ' · ' + esc(e.city) : ''}</p>
      ${!e.timeLabel && tz !== HOME.tz ? `<p class="muted">Dallas time: ${clock(HOME.tz, e._start)} ${clockDay(HOME.tz, e._start)}</p>` : ''}
      ${loc.name || loc.address ? `<div class="place">📍 <b>${esc(loc.name || '')}</b>${loc.address ? `<br>${esc(loc.address)}` : ''}</div>` : ''}
      ${ext(mapsLink(e.location), '🗺️ Open in Google Maps', 'btn primary big')}
      ${e.transit ? `<h3>How to get there</h3><div class="transit">🚆 ${linkify(e.transit)}</div>` : ''}
      ${e.notes ? `<h3>Notes</h3><p class="notes">${linkify(e.notes)}</p>` : ''}
      <h3>Who's going</h3><p>${esc(who)}</p>
      ${e.attachments?.length ? `<h3>Tickets & files</h3><div class="thumbs">${e.attachments.map((a, i) => {
        const pic = pictureUrls(a)[0];
        return `<a href="#/file/${esc(e.id)}/${i}" class="thumb">${pic ? `<img src="${esc(pic)}" alt="" loading="lazy">` : '<span>📄</span>'}<small>${esc(a.name)}</small></a>`;
      }).join('')}</div>` : ''}
    </article>
    <div class="stack"><a class="btn" href="#/edit/${esc(e.id)}">✏️ Edit</a></div>
    ${e.updatedBy ? `<p class="muted small center">Last changed by ${esc(memberName(e.updatedBy))}</p>` : ''}`,
  };
}

// ---------- Attachment viewer (full screen) ----------
export function fileView(id, i) {
  const e = findEvent(id);
  const a = e?.attachments?.[+i];
  if (!a) return notFound('#/plan');
  const pics = pictureUrls(a);
  const n = e.attachments.length;
  return {
    title: a.name, full: true, live: false,
    html: `<div class="viewer">
      <div class="viewer-bar"><a class="btn" href="#/event/${esc(id)}">✕ Close</a><span>${esc(a.name)}${n > 1 ? ` (${+i + 1}/${n})` : ''}</span>
        ${n > 1 ? `<a class="btn" href="#/file/${esc(id)}/${(+i + 1) % n}">Next ›</a>` : ''}</div>
      ${pics.length ? pics.map((u) => `<img src="${esc(u)}" alt="${esc(a.name)}">`).join('') : '<p class="center">No picture saved for this file.</p>'}
      ${a.kind === 'pdf' && a.url ? `<p class="center">${ext(a.url, 'Open original PDF (needs internet)')}</p>` : ''}
    </div>`,
  };
}

// ---------- A place shared in from Google Maps ----------
export function shared() {
  const p = state.prefill;
  if (!p) { go('#/now'); return null; }
  return {
    title: 'Add a place', back: '#/now', live: false,
    html: `<div class="card"><h2>${esc(p.name || 'Shared place')}</h2>${p.address ? `<p>${esc(p.address)}</p>` : ''}
      <div class="stack"><a class="btn primary big" href="#/edit/new">📅 Add to the plan</a><a class="btn big" href="#/wish-edit/new">⭐ Add to the wishlist</a></div></div>`,
  };
}

// ---------- Add / edit an event ----------
export const PLACE_FIELDS = (loc) => `
  <fieldset><legend>Place</legend>
    <label>Paste a Google Maps link <span class="muted">(or what Google Maps shares)</span><textarea name="paste" rows="2" placeholder="https://maps.app.goo.gl/..."></textarea></label>
    <button type="button" class="btn" id="fill">Fill in from link</button>
    <label>Place name<input name="locName" value="${esc(loc.name || '')}"></label>
    <label>Address<textarea name="locAddress" rows="2">${esc(loc.address || '')}</textarea></label>
    <p class="small" id="pin"></p>
  </fieldset>`;

// Shared by the event form and the wishlist form: wires up "Fill in from link" and "Find on map".
export function wirePlace(el, loc) {
  const pin = el.querySelector('#pin');
  const show = () => {
    pin.innerHTML = loc.lat != null ? '📍 Pinned on the map.' : 'Not pinned on the map yet. <button type="button" class="link" id="findpin">Find it</button>';
    pin.querySelector('#findpin')?.addEventListener('click', find);
  };
  const find = async () => {
    const q = [el.querySelector('[name=locAddress]').value, el.querySelector('[name=locName]').value].map((s) => s.trim()).filter(Boolean);
    if (!q.length) { toast('Type a name or address first'); return; }
    pin.textContent = 'Looking…';
    try {
      const g = (await geocode(q[0])) || (q[1] ? await geocode(q[1]) : null);
      if (g) { loc.lat = g.lat; loc.lng = g.lng; } else toast('Could not find it on the map. That is OK; Google Maps will still work.');
    } catch { toast('Needs the internet'); }
    show();
  };
  el.querySelector('#fill').addEventListener('click', async () => {
    const p = parseMapsInput(el.querySelector('[name=paste]').value);
    if (!p.mapsUrl && !p.name) { toast('Paste a Google Maps link first'); return; }
    Object.assign(loc, { mapsUrl: p.mapsUrl, lat: p.lat, lng: p.lng });
    if (p.name) el.querySelector('[name=locName]').value = p.name;
    if (p.address) el.querySelector('[name=locAddress]').value = p.address;
    const title = el.querySelector('[name=title]');
    if (title && !title.value && p.name) title.value = p.name;
    if (!p.name && !p.address) toast('Short links do not include the name. Please type the place name.');
    show();
    if (loc.lat == null && (p.address || p.name) && navigator.onLine) find();
  });
  el.querySelectorAll('[name=locAddress],[name=locName]').forEach((i) => i.addEventListener('change', () => { if (loc.lat != null && !loc.mapsUrl) { loc.lat = null; loc.lng = null; show(); } }));
  show();
}

export function readPlace(el, loc) {
  const name = el.querySelector('[name=locName]').value.trim();
  const address = el.querySelector('[name=locAddress]').value.trim();
  if (!name && !address && !loc.mapsUrl) return null;
  return { name, address, lat: loc.lat ?? null, lng: loc.lng ?? null, mapsUrl: loc.mapsUrl || '' };
}

// After saving, quietly add a map pin for places that have an address but no pin.
export async function autoPin(path, location) {
  if (!location || location.lat != null || !navigator.onLine) return;
  const q = location.address || location.name;
  if (!q) return;
  try {
    const g = await geocode(q);
    if (g) store.update(path, { location: { ...location, lat: g.lat, lng: g.lng } });
  } catch { /* fine */ }
}

// Background: add map pins to imported places that have an address but no pin (one lookup per second).
let pinning = false;
export async function pinMissing() {
  if (pinning || !navigator.onLine || !state.code) return;
  pinning = true;
  let tried;
  try { tried = new Set(JSON.parse(localStorage.getItem('tp.pintried') || '[]')); } catch { tried = new Set(); }
  const key = (x) => x.id + '|' + (x.location.address || x.location.name);
  const todo = [...state.events.map((e) => ['events', e]), ...state.wish.map((w) => ['wishlist', w])]
    .filter(([, x]) => x.location && x.location.lat == null && (x.location.address || x.location.name) && !tried.has(key(x)));
  const wait = () => new Promise((r) => setTimeout(r, 1100));
  for (const [col, x] of todo) {
    if (!navigator.onLine) break;
    const { name, address } = x.location;
    // Full street addresses often fail, so also try "place name, city".
    const tries = [address, name && x.city && x.city !== 'Other' ? `${name}, ${x.city}` : '', name].filter(Boolean);
    for (const q of [...new Set(tries)]) {
      let g = null;
      try { g = await geocode(q); } catch { /* offline */ }
      await wait();
      if (g) { store.update(['trips', state.code, col, x.id], { location: { ...x.location, lat: g.lat, lng: g.lng } }); break; }
    }
    tried.add(key(x));
    try { localStorage.setItem('tp.pintried', JSON.stringify([...tried])); } catch { /* ignore */ }
  }
  pinning = false;
}

const LEADS = [[15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [180, '3 hours'], [240, '4 hours'], [1440, '1 day']];

export function eventEdit(id, date) {
  const isNew = id === 'new';
  const src = isNew ? null : findEvent(id);
  if (!isNew && !src) return notFound('#/plan');
  const d0 = date || defaultDay();
  const e = src ? clone(src) : { title: '', date: d0, time: '', timeLabel: '', endTime: '', city: dayCity(d0), location: null, notes: '', transit: '', attendees: [], important: false, reminderMins: 60, attachments: [] };
  if (isNew && state.prefill) { e.title = state.prefill.name || ''; e.location = clean(state.prefill); state.prefill = null; }
  const loc = { ...(e.location || {}) };
  let atts = e.attachments || [];
  const added = [], removed = [];
  const t = state.trip;
  const days = tripDays(t);
  const back = isNew ? '#/plan/' + e.date : '#/event/' + id;

  return {
    title: isNew ? 'Add to plan' : 'Edit', back, live: false,
    html: `<form class="card" id="f" novalidate>
      <label>What<input name="title" value="${esc(e.title)}" required placeholder="Dinner, Flight, Museum…"></label>
      <div class="two">
        <label>Day<select name="date">${days.map((x, i) => `<option value="${x}" ${x === e.date ? 'selected' : ''}>Day ${i + 1} · ${esc(dayLabel(x))}</option>`).join('')}
          ${days.includes(e.date) ? '' : `<option value="${esc(e.date)}" selected>${esc(dayLabel(e.date))}</option>`}</select></label>
        <label>City<select name="city">${t.cities.map((c) => `<option ${c.name === e.city ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      </div>
      <div class="two">
        <label>Start time<input type="time" name="time" value="${esc(e.timeLabel ? '' : e.time)}"></label>
        <label>End time <span class="muted">(optional)</span><input type="time" name="endTime" value="${esc(e.endTime || '')}"></label>
      </div>
      <label>…or a rough time<select name="timeLabel"><option value="">Use the exact time</option>${Object.keys(ROUGH).map((k) => `<option ${k === e.timeLabel ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      ${PLACE_FIELDS(loc)}
      <label>How to get there <span class="muted">(transit note)</span><textarea name="transit" rows="2" placeholder="Take the Ginza Line from Shibuya to Asakusa">${esc(e.transit || '')}</textarea></label>
      <label>Notes<textarea name="notes" rows="3">${esc(e.notes || '')}</textarea></label>
      <fieldset><legend>Who's going</legend>
        <div class="checks">${t.members.map((m) => `<label class="check"><input type="checkbox" name="att" value="${esc(m.id)}" ${e.attendees?.includes(m.id) ? 'checked' : ''}> ${esc(m.name)}</label>`).join('')}</div>
        <p class="muted small">Leave everyone unticked if the whole group is going.</p>
      </fieldset>
      <fieldset><legend>Important</legend>
        <label class="check"><input type="checkbox" name="important" ${e.important ? 'checked' : ''}> ⭐ Important (flight, train, reservation)</label>
        <label>Remind before<select name="reminderMins">${LEADS.map(([v, n]) => `<option value="${v}" ${v === (e.reminderMins || 60) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </fieldset>
      <fieldset><legend>Tickets & files</legend>
        <div id="atts"></div>
        <label class="btn file-btn">📎 Add photo, screenshot or PDF<input type="file" id="file" accept="image/*,application/pdf" multiple hidden></label>
        <p class="small muted" id="upmsg"></p>
      </fieldset>
      <div class="stack">
        <button class="btn primary big" id="save">Save</button>
        <a class="btn" href="${back}" id="cancel">Cancel</a>
        ${isNew ? '' : '<button type="button" class="btn danger" id="del">Delete</button>'}
      </div>
    </form>`,
    mount(el) {
      const f = el.querySelector('#f');
      wirePlace(el, loc);
      let busy = false;
      const drawAtts = () => {
        el.querySelector('#atts').innerHTML = atts.map((a, i) => {
          const pic = pictureUrls(a)[0];
          return `<div class="att">${pic ? `<img src="${esc(pic)}" alt="">` : '<span>📄</span>'}<span>${esc(a.name)}</span><button type="button" class="icon-btn" data-rm="${i}" aria-label="Remove">✕</button></div>`;
        }).join('');
        el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
          const [a] = atts.splice(+b.dataset.rm, 1);
          if (added.includes(a)) deleteAttachment(a); else removed.push(a);
          drawAtts();
        }));
      };
      drawAtts();
      el.querySelector('#file').addEventListener('change', async (ev) => {
        const files = [...ev.target.files];
        ev.target.value = '';
        if (store.mode !== 'local' && !navigator.onLine) { toast('Adding files needs the internet'); return; }
        const msg = el.querySelector('#upmsg');
        busy = true;
        for (const file of files) {
          msg.textContent = `Saving ${file.name}…`;
          try {
            const a = await processAttachment(state.code, file);
            atts.push(a); added.push(a); drawAtts();
          } catch (err) { console.error(err); toast(err.message || 'Could not add the file'); }
        }
        msg.textContent = '';
        busy = false;
      });
      el.querySelector('#cancel').addEventListener('click', () => { added.forEach(deleteAttachment); });
      f.addEventListener('submit', (ev) => {
        ev.preventDefault();
        if (busy) { toast('Wait for the file to finish saving'); return; }
        const title = f.title.value.trim();
        if (!title) { toast('Type what it is'); f.title.focus(); return; }
        let label = f.timeLabel.value;
        let time = f.time.value;
        if (!time && !label) label = 'Time TBD';
        if (label && !time) time = ROUGH[label];
        const data = {
          title, date: f.date.value, time, timeLabel: label, endTime: label ? '' : f.endTime.value, city: f.city.value,
          location: readPlace(el, loc), notes: f.notes.value.trim(), transit: f.transit.value.trim(),
          attendees: [...f.querySelectorAll('[name=att]:checked')].map((i) => i.value),
          important: f.important.checked, reminderMins: +f.reminderMins.value, attachments: atts,
          updatedAt: Date.now(), updatedBy: state.me,
        };
        const newId = isNew ? uid() : id;
        const path = ['trips', state.code, 'events', newId];
        store.set(path, data);
        removed.forEach(deleteAttachment);
        autoPin(path, data.location);
        toast('Saved');
        go('#/event/' + newId);
      });
      el.querySelector('#del')?.addEventListener('click', async () => {
        if (!(await confirmBox(`Delete "${src.title}"?`))) return;
        store.remove(['trips', state.code, 'events', id]);
        [...atts, ...removed].forEach(deleteAttachment);
        go('#/plan/' + src.date);
      });
    },
  };
}

// Wishlist, hotel cards for taxi drivers, money, phrasebook, packing list, time zones, "More" menu.
import { state, go, hooks, memberName } from './state.js';
import { store } from './store.js';
import { esc, uid, clean, tripDays, dayLabel, ROUGH, mapsLink, ago, clock, clockDay, HOME, FLAG, curOfTz, langOfTz, cityOf, todayIn } from './util.js';
import { dayCity, currentCity } from './derived.js';
import { PLACE_FIELDS, wirePlace, readPlace, autoPin } from './views-plan.js';
import { PHRASES } from './phrases.js';
import { toast, modal, confirmBox } from './ui.js';

const ext = (href, label, cls = 'btn') => (href ? `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener">${label}</a>` : '');
const linkify = (s) => esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u.length > 45 ? u.slice(0, 42) + '…' : u}</a>`);

// ---------- More ----------
export function more() {
  const t = state.trip;
  const item = (href, icon, label, sub = '', external = false) => `<a class="menu-item" href="${esc(href)}" ${external ? 'target="_blank" rel="noopener"' : ''}><span class="mi-icon">${icon}</span><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span></a>`;
  return {
    title: 'More', tab: 'more', live: false,
    html: `<nav class="menu">
      ${item('#/hotels', '🏨', 'Hotel cards', 'Show the taxi driver')}
      ${item('#/money', '💱', 'Money', 'US$ · Yen · NT$')}
      ${item('#/phrases', '🗣️', 'Phrases', 'Japanese & Mandarin')}
      ${item('#/packing', '🧳', 'My packing list')}
      ${item('#/time', '🕒', 'Time zones', 'Trip time and Dallas time')}
      ${t.photosUrl ? item(t.photosUrl, '📷', 'Shared photo album', 'Opens Google Photos', true) : item('#/settings', '📷', 'Shared photo album', 'Add the link in Trip settings')}
      ${item('#/settings', '⚙️', 'Trip settings', 'Trip code, people, cities, backup')}
      ${item('#/trips', '🧭', 'All my trips')}
    </nav>`,
  };
}

// ---------- Wishlist ----------
export function wish() {
  const groups = {};
  for (const w of state.wish) (groups[w.city || 'Other'] ||= []).push(w);
  const order = [...(state.trip.cities || []).map((c) => c.name), ...Object.keys(groups)].filter((v, i, a) => groups[v] && a.indexOf(v) === i);
  const card = (w) => `<div class="card wish">
    <h3>${esc(w.title)}</h3>
    ${w.location?.address ? `<p class="small">📍 ${esc(w.location.address)}</p>` : ''}
    ${w.notes ? `<p class="small clamp">${linkify(w.notes)}</p>` : ''}
    ${w.link ? `<p class="small">${linkify(w.link)}</p>` : ''}
    ${w.addedBy ? `<p class="muted small">Added by ${esc(state.trip.members.some((m) => m.id === w.addedBy) ? memberName(w.addedBy) : w.addedBy)}</p>` : ''}
    <div class="btn-row">
      <button class="btn primary" data-plan="${esc(w.id)}">📅 Add to plan</button>
      ${w.location?.name || w.location?.address || w.location?.mapsUrl ? ext(mapsLink(w.location, w.title), '🗺️ Map') : ''}
      <a class="btn" href="#/wish-edit/${esc(w.id)}">Edit</a>
    </div></div>`;
  return {
    title: 'Wishlist', tab: 'wish', live: true,
    html: `<p class="muted">Places the group would like to visit. Anyone can add one.</p>
      <a class="btn primary big" href="#/wish-edit/new">+ Add a place</a>
      ${order.length ? order.map((c) => `<h2 class="section">${esc(c)}</h2>${groups[c].map(card).join('')}`).join('') : '<div class="card center muted">No places yet.</div>'}`,
    mount(el) {
      el.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => addToPlan(state.wish.find((w) => w.id === b.dataset.plan))));
    },
  };
}

async function addToPlan(w) {
  const days = tripDays(state.trip);
  const r = await modal(`Add "${w.title}" to the plan`, `
    <label>Which day?<select name="date">${days.map((d, i) => `<option value="${d}" ${dayCity(d) === w.city ? '' : ''}>Day ${i + 1} · ${esc(dayLabel(d))} · ${esc(dayCity(d))}</option>`).join('')}</select></label>
    <label>Time<input type="time" name="time"></label>
    <label>…or a rough time<select name="timeLabel"><option value="">Use the time above</option>${Object.keys(ROUGH).map((k) => `<option>${k}</option>`).join('')}</select></label>`,
  [{ label: 'Cancel', value: false }, { label: 'Add to plan', value: true, cls: 'primary' }]);
  if (!r.value) return;
  let { date, time, timeLabel } = r.data;
  if (!time && !timeLabel) timeLabel = 'Time TBD';
  if (timeLabel && !time) time = ROUGH[timeLabel];
  const city = cityOf(state.trip, w.city) && state.trip.cities.some((c) => c.name === w.city) ? w.city : dayCity(date);
  const id = uid();
  const data = {
    title: w.title, date, time, timeLabel: timeLabel || '', endTime: '', city, location: w.location || null,
    notes: [w.notes, w.link].filter(Boolean).join('\n'), transit: '', attendees: [], important: false, reminderMins: 60, attachments: [],
    updatedAt: Date.now(), updatedBy: state.me,
  };
  store.set(['trips', state.code, 'events', id], data);
  store.remove(['trips', state.code, 'wishlist', w.id]);
  toast('Moved to the plan');
  go('#/event/' + id);
}

export function wishEdit(id) {
  const isNew = id === 'new';
  const src = isNew ? null : state.wish.find((w) => w.id === id);
  if (!isNew && !src) { go('#/wish'); return null; }
  const w = src ? { ...src } : { title: '', city: currentCity().name, location: null, notes: '', link: '' };
  if (isNew && state.prefill) { w.title = state.prefill.name || ''; w.location = clean(state.prefill); state.prefill = null; }
  const loc = { ...(w.location || {}) };
  const cities = [...new Set([...(state.trip.cities || []).map((c) => c.name), w.city].filter(Boolean))];
  return {
    title: isNew ? 'Add a place' : 'Edit place', back: '#/wish', live: false,
    html: `<form class="card" id="f" novalidate>
      <label>Place<input name="title" value="${esc(w.title)}" placeholder="Shilin Night Market"></label>
      <label>City<select name="city">${cities.map((c) => `<option ${c === w.city ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="Other" ${w.city === 'Other' ? 'selected' : ''}>Other</option></select></label>
      ${PLACE_FIELDS(loc)}
      <label>Website link <span class="muted">(optional)</span><input name="link" type="url" value="${esc(w.link || '')}"></label>
      <label>Notes<textarea name="notes" rows="4">${esc(w.notes || '')}</textarea></label>
      <div class="stack"><button class="btn primary big">Save</button><a class="btn" href="#/wish">Cancel</a>
      ${isNew ? '' : '<button type="button" class="btn danger" id="del">Delete</button>'}</div>
    </form>`,
    mount(el) {
      wirePlace(el, loc);
      el.querySelector('#f').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = ev.target;
        const title = f.title.value.trim() || f.locName.value.trim();
        if (!title) { toast('Type the place name'); return; }
        const data = { title, city: f.city.value, location: readPlace(el, loc), notes: f.notes.value.trim(), link: f.link.value.trim(), addedBy: w.addedBy || state.me, updatedAt: Date.now() };
        const path = ['trips', state.code, 'wishlist', isNew ? uid() : id];
        store.set(path, data);
        autoPin(path, data.location);
        go('#/wish');
      });
      el.querySelector('#del')?.addEventListener('click', async () => {
        if (!(await confirmBox(`Delete "${src.title}"?`))) return;
        store.remove(['trips', state.code, 'wishlist', id]);
        go('#/wish');
      });
    },
  };
}

// ---------- Hotels / show-to-driver cards ----------
const hotelLang = (h) => langOfTz(cityOf(state.trip, h.city)?.tz);
const PLEASE = { ja: 'このホテルまでお願いします。', zh: '請帶我到這家飯店。' };

export function hotels() {
  const hs = [...state.hotels].sort((a, b) => String(a.checkIn).localeCompare(String(b.checkIn)));
  return {
    title: 'Hotel cards', back: '#/more', live: true,
    html: `<p class="muted">Tap a hotel to show its name and address in large local writing. Hand your phone to the taxi driver.</p>
      ${hs.map((h) => `<a class="row-btn" href="#/hotel/${esc(h.id)}"><b>${esc(h.nameLocal || h.name)}</b><span>${esc(h.name)}${h.checkIn ? ` · ${esc(dayLabel(h.checkIn, { month: 'short', day: 'numeric' }))} – ${esc(dayLabel(h.checkOut || h.checkIn, { month: 'short', day: 'numeric' }))}` : ''}</span></a>`).join('') || '<div class="card center muted">No hotels yet.</div>'}
      <a class="btn primary" href="#/hotel-edit/new">+ Add a hotel</a>`,
  };
}

export function hotelCard(id) {
  const h = state.hotels.find((x) => x.id === id);
  if (!h) { go('#/hotels'); return null; }
  const lang = hotelLang(h);
  return {
    title: h.name, full: true, live: false,
    html: `<div class="driver" lang="${lang === 'ja' ? 'ja' : lang === 'zh' ? 'zh-Hant-TW' : 'en'}">
      <div class="viewer-bar"><a class="btn" href="#/hotels">✕ Close</a><a class="btn" href="#/hotel-edit/${esc(h.id)}">Edit</a></div>
      ${lang ? `<p class="driver-please">${PLEASE[lang]}</p>` : ''}
      <h1 class="driver-name">${esc(h.nameLocal || h.name)}</h1>
      <p class="driver-addr">${esc(h.addressLocal || h.address || '')}</p>
      ${h.phone ? `<p class="driver-phone">☎ ${esc(h.phone)}</p>` : ''}
      <div class="driver-en"><b>${esc(h.name)}</b><br>${esc(h.address || '')}</div>
      ${h.notes ? `<p class="driver-en small">${linkify(h.notes)}</p>` : ''}
      <div class="stack">${ext(mapsLink({ name: h.name, address: h.address }), '🗺️ Open in Google Maps')}</div>
    </div>`,
  };
}

export function hotelEdit(id) {
  const isNew = id === 'new';
  const h = isNew ? { city: currentCity().name } : state.hotels.find((x) => x.id === id);
  if (!h) { go('#/hotels'); return null; }
  const field = (name, label, extra = '') => `<label>${label}<input name="${name}" value="${esc(h[name] || '')}" ${extra}></label>`;
  return {
    title: isNew ? 'Add a hotel' : 'Edit hotel', back: isNew ? '#/hotels' : '#/hotel/' + id, live: false,
    html: `<form class="card" id="f">
      <label>City<select name="city">${state.trip.cities.map((c) => `<option ${c.name === h.city ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      ${field('name', 'Hotel name (English)', 'required')}
      ${field('nameLocal', 'Hotel name in Japanese / Chinese', 'lang="ja"')}
      <label>Address (English)<textarea name="address" rows="2">${esc(h.address || '')}</textarea></label>
      <label>Address in Japanese / Chinese<textarea name="addressLocal" rows="2">${esc(h.addressLocal || '')}</textarea></label>
      <p class="muted small">Tip: search the hotel on Google Maps with the language set to Japanese or Chinese, or copy it from the hotel's website.</p>
      ${field('phone', 'Phone', 'type="tel"')}
      <div class="two">${field('checkIn', 'Check-in', 'type="date"')}${field('checkOut', 'Check-out', 'type="date"')}</div>
      <label>Notes <span class="muted">(confirmation numbers…)</span><textarea name="notes" rows="3">${esc(h.notes || '')}</textarea></label>
      <div class="stack"><button class="btn primary big">Save</button>
      ${isNew ? '' : '<button type="button" class="btn danger" id="del">Delete</button>'}</div>
    </form>`,
    mount(el) {
      el.querySelector('#f').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(ev.target).entries());
        for (const k of Object.keys(d)) d[k] = d[k].trim();
        const newId = isNew ? uid() : id;
        store.set(['trips', state.code, 'hotels', newId], d);
        go('#/hotel/' + newId);
      });
      el.querySelector('#del')?.addEventListener('click', async () => {
        if (!(await confirmBox(`Delete ${h.name}?`))) return;
        store.remove(['trips', state.code, 'hotels', id]);
        go('#/hotels');
      });
    },
  };
}

// ---------- Money ----------
const CUR = { USD: { sym: '$', name: 'US dollars', flag: '🇺🇸', dec: 2 }, JPY: { sym: '¥', name: 'Japanese yen', flag: '🇯🇵', dec: 0 }, TWD: { sym: 'NT$', name: 'Taiwan dollars', flag: '🇹🇼', dec: 0 } };
const fmtMoney = (v, c) => CUR[c].sym + v.toLocaleString('en-US', { minimumFractionDigits: CUR[c].dec, maximumFractionDigits: CUR[c].dec });

let lastAmount = '';
export function money() {
  const rates = state.trip.rates || {};
  const perUsd = { USD: 1, JPY: rates.JPY?.perUSD, TWD: rates.TWD?.perUSD };
  let from = (() => { try { return sessionStorage.getItem('tp.cur'); } catch { return null; } })() || curOfTz(currentCity().tz);
  if (!CUR[from]) from = 'JPY';
  const rateRow = (c) => `<div class="rate"><label>1 US$ = <input id="rate-${c}" name="${c}" type="number" inputmode="decimal" step="any" value="${esc(perUsd[c] ?? '')}" placeholder="?"> ${CUR[c].sym}</label>
    <small class="muted">${rates[c]?.updatedAt ? `Updated ${esc(ago(rates[c].updatedAt))} by ${esc(memberName(rates[c].by))}` : 'Not set yet'}</small></div>`;
  const quick = { JPY: [100, 500, 1000, 3000, 5000, 10000], TWD: [50, 100, 300, 500, 1000, 2000], USD: [1, 5, 10, 20, 50, 100] };
  return {
    title: 'Money', back: '#/more', live: true, noTick: true,
    html: `<div class="card">
      <div class="seg" id="seg">${Object.keys(CUR).map((c) => `<button type="button" data-c="${c}" class="${c === from ? 'on' : ''}">${CUR[c].flag} ${CUR[c].sym}</button>`).join('')}</div>
      <label class="amount"><span id="sym">${CUR[from].sym}</span><input id="amt" type="number" inputmode="decimal" step="any" placeholder="0" value="${esc(lastAmount)}"></label>
      <div id="out" class="conv"></div>
    </div>
    <div class="card"><h2>Quick guide</h2><table class="quick" id="quick"></table></div>
    <form class="card" id="rates">
      <h2>Exchange rates</h2>
      <p class="small muted">Type today's rate (from a bank or currency app). Everyone on the trip sees it, even offline.</p>
      ${rateRow('JPY')}${rateRow('TWD')}
      <button class="btn primary">Save rates</button>
    </form>`,
    mount(el) {
      const amt = el.querySelector('#amt');
      const draw = () => {
        const v = parseFloat(amt.value) || 0;
        const usd = perUsd[from] ? v / perUsd[from] : null;
        el.querySelector('#sym').textContent = CUR[from].sym;
        el.querySelector('#out').innerHTML = Object.keys(CUR).filter((c) => c !== from).map((c) =>
          `<div class="conv-row"><span>${CUR[c].flag}</span><b>${usd != null && perUsd[c] ? fmtMoney(usd * perUsd[c], c) : '—'}</b><small>${CUR[c].name}</small></div>`).join('')
          + (!perUsd.JPY || !perUsd.TWD ? '<p class="small muted">Set the exchange rates below first.</p>' : '');
        const other = from === 'USD' ? (curOfTz(currentCity().tz) === 'USD' ? 'JPY' : curOfTz(currentCity().tz)) : 'USD';
        el.querySelector('#quick').innerHTML = perUsd[from] && perUsd[other]
          ? quick[from].map((q) => `<tr><td>${fmtMoney(q, from)}</td><td>≈ ${fmtMoney((q / perUsd[from]) * perUsd[other], other)}</td></tr>`).join('')
          : '<tr><td class="muted">Set the exchange rates below first.</td></tr>';
      };
      amt.addEventListener('input', () => { lastAmount = amt.value; draw(); });
      el.querySelectorAll('#seg button').forEach((b) => b.addEventListener('click', () => {
        from = b.dataset.c;
        try { sessionStorage.setItem('tp.cur', from); } catch { /* ignore */ }
        el.querySelectorAll('#seg button').forEach((x) => x.classList.toggle('on', x === b));
        draw();
        amt.focus();
      }));
      el.querySelector('#rates').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const upd = {};
        for (const c of ['JPY', 'TWD']) {
          const v = parseFloat(ev.target[c].value);
          if (v > 0 && v !== perUsd[c]) { upd[c] = { perUSD: v, updatedAt: Date.now(), by: state.me }; perUsd[c] = v; }
        }
        if (Object.keys(upd).length) store.update(['trips', state.code], { rates: upd });
        toast('Rates saved');
      });
      draw();
    },
  };
}

// ---------- Phrasebook ----------
export function phrases(lang) {
  const l = lang || langOfTz(currentCity().tz) || 'ja';
  const book = PHRASES[l];
  const canSpeak = 'speechSynthesis' in window;
  return {
    title: 'Phrases', back: '#/more', live: false,
    html: `<div class="seg">${Object.entries(PHRASES).map(([k, v]) => `<a href="#/phrases/${k}" class="${k === l ? 'on' : ''}">${k === 'ja' ? '🇯🇵' : '🇹🇼'} ${v.name}</a>`).join('')}</div>
      ${canSpeak ? '<p class="muted small center">Tap a phrase to hear it.</p>' : ''}
      <div class="phrases" lang="${l === 'ja' ? 'ja' : 'zh-Hant-TW'}">${book.list.map(([en, native, rom], i) => `<button class="phrase" data-i="${i}">
        <small>${esc(en)}</small><span class="native">${esc(native)}</span><span class="rom">${esc(rom)}</span></button>`).join('')}</div>`,
    mount(el) {
      if (!canSpeak) return;
      el.querySelectorAll('.phrase').forEach((b) => b.addEventListener('click', () => {
        const u = new SpeechSynthesisUtterance(book.list[+b.dataset.i][1].replace(' / ', '、'));
        u.lang = book.voice; u.rate = 0.85;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      }));
    },
  };
}

// ---------- Packing (each person's own list) ----------
const STARTER = ['Passport', 'Phone charger', 'Power bank', 'Medicines', 'Toothbrush', 'Pajamas', 'Walking shoes', 'Warm jacket', 'Umbrella', 'Glasses / sunglasses', 'Cash (yen, NT$)', 'Credit card'];

export function packing() {
  const items = state.packing?.items || [];
  const left = items.filter((i) => !i.done).length;
  const path = ['trips', state.code, 'packing', state.me];
  const save = (list) => store.set(path, { items: list });
  return {
    title: 'My packing list', back: '#/more', live: true,
    html: `<p class="muted">Only you see this list.</p>
      ${items.length ? `<p class="big">${left ? `<b>${left}</b> left to pack` : '✅ All packed!'}</p>` : ''}
      <form id="add" class="add-row"><input id="packadd" name="text" placeholder="Add an item" autocomplete="off"><button class="btn primary">Add</button></form>
      <ul class="pack">${items.map((i) => `<li class="${i.done ? 'done' : ''}"><label><input type="checkbox" data-t="${esc(i.id)}" ${i.done ? 'checked' : ''}> <span>${esc(i.text)}</span></label><button class="icon-btn" data-d="${esc(i.id)}" aria-label="Remove">✕</button></li>`).join('')}</ul>
      <div class="stack">
        ${items.length ? '<button class="btn" id="reset">Untick everything (for the trip home)</button>' : '<button class="btn" id="starter">Add common items</button>'}
      </div>`,
    mount(el) {
      el.querySelector('#add').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const text = ev.target.text.value.trim();
        if (!text) return;
        save([...items, { id: uid(), text, done: false }]);
      });
      el.querySelectorAll('[data-t]').forEach((c) => c.addEventListener('change', () => save(items.map((i) => (i.id === c.dataset.t ? { ...i, done: c.checked } : i)))));
      el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => save(items.filter((i) => i.id !== b.dataset.d))));
      el.querySelector('#reset')?.addEventListener('click', () => save(items.map((i) => ({ ...i, done: false }))));
      el.querySelector('#starter')?.addEventListener('click', () => save(STARTER.map((text) => ({ id: uid(), text, done: false }))));
    },
  };
}

// ---------- Time zones ----------
export function time() {
  const seen = new Set();
  const zones = [...(state.trip.cities || [])].filter((c) => !seen.has(c.tz) && seen.add(c.tz));
  if (!seen.has(HOME.tz)) zones.push({ name: 'Dallas', tz: HOME.tz });
  const here = currentCity();
  const label = (tz) => (state.trip.cities.filter((c) => c.tz === tz).map((c) => c.name).join(' · ') || 'Dallas');
  return {
    title: 'Time zones', back: '#/more', live: true,
    html: zones.map((z) => `<div class="card clock-card${z.tz === here.tz ? ' here' : ''}">
        <div>${FLAG[z.tz] || '🌏'} <b>${esc(label(z.tz))}</b>${z.tz === here.tz ? ' <span class="pill">You are here</span>' : ''}</div>
        <div class="big-clock">${clock(z.tz)} <small>${clockDay(z.tz)}</small></div>
        <div class="muted small">${esc(dayLabel(todayIn(z.tz), { weekday: 'long', month: 'long', day: 'numeric' }))}</div>
      </div>`).join('')
      + '<p class="muted small center">Japan is 1 hour ahead of Taiwan. All plan times are shown in the local time of their city.</p>',
  };
}

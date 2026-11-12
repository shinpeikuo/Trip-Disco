// Screens for trips: list, create, join with a code, pick your name, settings.
import { state, hooks, device, go, meName } from './state.js';
import { store } from './store.js';
import { esc, uid, clean, makeCode, normCode, fmtCode, CITY_PRESETS, TZ_CHOICES, HOME, dayLabel, geocode, todayIn } from './util.js';
import { toast, modal, confirmBox } from './ui.js';

const appUrl = () => location.origin + location.pathname;
const dates = (t) => (t.startDate ? `${dayLabel(t.startDate, { month: 'short', day: 'numeric' })} – ${dayLabel(t.endDate, { month: 'short', day: 'numeric', year: 'numeric' })}` : '');

export function missingTrip() {
  return `<div class="card"><h2>Trip not found</h2><p>This trip could not be loaded. If you are offline, connect to the internet once and try again.</p>
  <a class="btn primary" href="#/trips">See my trips</a></div>`;
}

// ---------- My trips ----------
export function trips() {
  const today = todayIn(HOME.tz);
  const list = device.list().sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  const upcoming = list.filter((t) => !t.endDate || t.endDate >= today).reverse();
  const past = list.filter((t) => t.endDate && t.endDate < today);
  const row = (t) => `<button class="row-btn" data-open="${esc(t.code)}"><b>${esc(t.name || 'Trip')}</b><span>${esc(dates(t))}</span></button>`;
  return {
    title: 'My trips', live: false,
    html: `
      ${list.length ? '' : `<div class="hero"><div class="hero-icon">✈️</div><h2>Welcome!</h2><p>Join your family's trip with the trip code you were sent, or create a new trip.</p></div>`}
      ${upcoming.length ? `<h2 class="section">Upcoming</h2>${upcoming.map(row).join('')}` : ''}
      ${past.length ? `<h2 class="section">Past trips</h2>${past.map(row).join('')}` : ''}
      <div class="stack">
        <a class="btn primary big" href="#/join">I have a trip code</a>
        <a class="btn" href="#/create">Create a new trip</a>
      </div>`,
    mount(el) {
      el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { hooks.openTrip(b.dataset.open); go('#/now'); }));
    },
  };
}

// ---------- Join ----------
export function join(codeFromLink) {
  return {
    title: 'Join a trip', back: '#/trips', live: false,
    html: `<form class="card" id="f">
      <p>Type the trip code from the text message.</p>
      <label>Trip code<input name="code" class="code-input" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX" value="${esc(codeFromLink ? fmtCode(codeFromLink) : '')}"></label>
      <button class="btn primary big">Continue</button>
      <p class="muted" id="msg"></p>
    </form>`,
    mount(el) {
      el.querySelector('#f').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const code = normCode(ev.target.code.value);
        const msg = el.querySelector('#msg');
        if (code.length < 16) { msg.textContent = 'The code has 16 letters and numbers.'; return; }
        msg.textContent = 'Looking for the trip…';
        try {
          const trip = await store.get(['trips', code]);
          if (!trip) { msg.textContent = 'No trip has that code. Please check it and try again.'; return; }
          state.pendingJoin = { code, trip };
          go('#/pick');
        } catch {
          msg.textContent = 'Could not reach the trip. Joining needs the internet once.';
        }
      });
    },
  };
}

// ---------- Pick your name ----------
export function pick() {
  const p = state.pendingJoin || (state.code && state.trip ? { code: state.code, trip: state.trip } : null);
  if (!p) { go('#/trips'); return null; }
  return {
    title: 'Who are you?', back: state.code ? '#/settings' : '#/trips', live: false,
    html: `<h2 class="section center">${esc(p.trip.name)}</h2>
      <p class="center">Tap your name.</p>
      <div class="stack">${(p.trip.members || []).map((m) => `<button class="btn big name-btn" data-id="${esc(m.id)}">${esc(m.name)}</button>`).join('')}</div>
      <p class="muted center">You can change this later in More → Trip settings.</p>`,
    mount(el) {
      el.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => {
        device.save({ code: p.code, me: b.dataset.id, name: p.trip.name, startDate: p.trip.startDate, endDate: p.trip.endDate });
        state.pendingJoin = null;
        hooks.openTrip(p.code);
        go('#/now');
      }));
    },
  };
}

// ---------- Create ----------
const cityChecks = (selected) => CITY_PRESETS.map((c) => `<label class="check"><input type="checkbox" name="city" value="${esc(c.name)}" ${selected.includes(c.name) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('');

export function create() {
  return {
    title: 'New trip', back: '#/trips', live: false,
    html: `<form class="card" id="f">
      <label>Trip name<input name="name" required placeholder="Japan & Taiwan 2026"></label>
      <div class="two"><label>First day<input type="date" name="startDate" required></label><label>Last day<input type="date" name="endDate" required></label></div>
      <fieldset><legend>Cities</legend><div class="checks">${cityChecks(['Dallas'])}</div>
        <p class="muted small">Other cities can be added later in Trip settings.</p></fieldset>
      <label>Who is going? <span class="muted">(one name per line)</span><textarea name="members" rows="5" placeholder="Shinpei&#10;Mom&#10;Dad"></textarea></label>
      <label>Shared Google Photos album link <span class="muted">(optional)</span><input name="photosUrl" type="url" placeholder="https://photos.app.goo.gl/..."></label>
      <button class="btn primary big">Create trip</button>
    </form>
    <div class="card">
      <h2>Start from a plan file</h2>
      <p>If you have a trip plan file (.json), choose it here. It brings in the trip, itinerary, wishlist and hotels.</p>
      <input type="file" id="planfile" accept=".json,application/json">
    </div>`,
    mount(el) {
      el.querySelector('#f').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = ev.target;
        const members = f.members.value.split('\n').map((s) => s.trim()).filter(Boolean).map((name) => ({ id: uid(), name }));
        if (!members.length) { toast('Add at least one name'); return; }
        if (f.endDate.value < f.startDate.value) { toast('The last day is before the first day'); return; }
        const cities = [...f.querySelectorAll('[name=city]:checked')].map((i) => CITY_PRESETS.find((c) => c.name === i.value));
        const trip = { name: f.name.value.trim(), startDate: f.startDate.value, endDate: f.endDate.value, cities, members, photosUrl: f.photosUrl.value.trim(), rates: {}, createdAt: Date.now() };
        const code = makeCode();
        store.set(['trips', code], trip);
        state.pendingJoin = { code, trip };
        go('#/pick');
      });
      el.querySelector('#planfile').addEventListener('change', async (ev) => {
        const file = ev.target.files[0];
        if (!file) return;
        try {
          const data = JSON.parse(await file.text());
          if (!data.trip?.members?.length) throw new Error('bad file');
          const code = makeCode();
          const trip = { ...clean(data.trip), rates: data.trip.rates || {}, createdAt: Date.now() };
          await store.set(['trips', code], trip);
          importItems(code, data, trip.members);
          state.pendingJoin = { code, trip };
          toast(`Imported ${data.events?.length || 0} plans and ${data.wishlist?.length || 0} wishlist places`);
          go('#/pick');
        } catch (e) {
          console.error(e);
          toast('That file is not a trip plan file.');
        }
      });
    },
  };
}

function importItems(code, data, members) {
  const ids = new Set((members || []).map((m) => m.id));
  for (const e of data.events || []) {
    const d = clean(e);
    d.attendees = (d.attendees || []).filter((a) => ids.has(a));
    store.set(['trips', code, 'events', e.id || uid()], d);
  }
  for (const w of data.wishlist || []) store.set(['trips', code, 'wishlist', w.id || uid()], clean(w));
  for (const h of data.hotels || []) store.set(['trips', code, 'hotels', h.id || uid()], clean(h));
}

// ---------- Settings ----------
export function settings() {
  const t = state.trip;
  const tzName = (tz) => (TZ_CHOICES.find((x) => x[0] === tz) || [tz, tz])[1];
  return {
    title: 'Trip settings', back: '#/more', live: false,
    html: `
    <div class="card">
      <p class="big">You are <b>${esc(meName())}</b></p>
      <a class="btn" href="#/pick">I'm someone else</a>
    </div>
    <div class="card">
      <h2>Trip code</h2>
      <p class="code-show">${esc(fmtCode(state.code))}</p>
      <p class="muted small">Anyone with this code can see and change the trip, so only send it to family.</p>
      <div class="stack">
        <button class="btn primary" id="sms">💬 Text the code</button>
        ${navigator.share ? '<button class="btn" id="share">Share…</button>' : ''}
        <button class="btn" id="copy">Copy code</button>
      </div>
    </div>
    <form class="card" id="details">
      <h2>Trip details</h2>
      <label>Trip name<input name="name" value="${esc(t.name)}" required></label>
      <div class="two"><label>First day<input type="date" name="startDate" value="${esc(t.startDate)}"></label><label>Last day<input type="date" name="endDate" value="${esc(t.endDate)}"></label></div>
      <label>Shared Google Photos album link<input name="photosUrl" type="url" value="${esc(t.photosUrl || '')}" placeholder="https://photos.app.goo.gl/..."></label>
      <button class="btn primary">Save details</button>
    </form>
    <div class="card">
      <h2>Cities</h2>
      ${(t.cities || []).map((c, i) => `<div class="line"><span><b>${esc(c.name)}</b> <span class="muted">${esc(tzName(c.tz))}</span></span><button class="icon-btn" data-delcity="${i}" aria-label="Remove">✕</button></div>`).join('')}
      <form id="addcity" class="add-row">
        <select name="preset"><option value="">Add a city…</option>${CITY_PRESETS.filter((p) => !(t.cities || []).some((c) => c.name === p.name)).map((p) => `<option>${esc(p.name)}</option>`).join('')}<option value="__other">Other city…</option></select>
        <button class="btn">Add</button>
      </form>
    </div>
    <div class="card">
      <h2>People</h2>
      ${(t.members || []).map((m) => `<div class="line"><input data-member="${esc(m.id)}" value="${esc(m.name)}" aria-label="Name"><button class="icon-btn" data-delmember="${esc(m.id)}" aria-label="Remove">✕</button></div>`).join('')}
      <div class="stack"><button class="btn" id="addmember">+ Add a person</button><button class="btn primary" id="savemembers">Save names</button></div>
    </div>
    <div class="card">
      <h2>Backup</h2>
      <p class="small">Save a copy of the whole trip as a file, or bring in a plan file. Attachments stay online and are not in the file.</p>
      <div class="stack"><button class="btn" id="export">⬇️ Save backup file</button>
      <label class="btn file-btn">⬆️ Import plan file<input type="file" id="import" accept=".json,application/json" hidden></label></div>
    </div>
    <div class="card">
      <h2>This device</h2>
      <p class="small">${store.mode === 'local'
        ? '⚠️ <b>Preview mode.</b> The shared family database is not connected yet, so this trip is saved only on this device.'
        : '✅ Connected to the shared family database. Changes made offline are sent when you are back online.'}</p>
      <div class="stack"><a class="btn" href="#/trips">All my trips</a><button class="btn danger" id="leave">Remove this trip from this device</button></div>
    </div>`,
    mount(el) {
      const msg = `Join our trip "${t.name}" in the Family Trip app.\n\n1. Open ${appUrl()}#/join/${state.code}\n2. Tap your name\n\nTrip code: ${fmtCode(state.code)}`;
      el.querySelector('#sms').addEventListener('click', () => { location.href = 'sms:?&body=' + encodeURIComponent(msg); });
      el.querySelector('#share')?.addEventListener('click', () => navigator.share({ text: msg }).catch(() => {}));
      el.querySelector('#copy').addEventListener('click', () => navigator.clipboard.writeText(fmtCode(state.code)).then(() => toast('Code copied'), () => toast(fmtCode(state.code))));

      el.querySelector('#details').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = ev.target;
        store.update(['trips', state.code], { name: f.name.value.trim(), startDate: f.startDate.value, endDate: f.endDate.value, photosUrl: f.photosUrl.value.trim() });
        toast('Saved');
      });

      el.querySelectorAll('[data-delcity]').forEach((b) => b.addEventListener('click', async () => {
        const cities = [...t.cities];
        const [c] = cities.splice(+b.dataset.delcity, 1);
        if (await confirmBox(`Remove ${c.name}?`, 'Remove')) { store.update(['trips', state.code], { cities }); setTimeout(() => hooks.refreshView(), 100); }
      }));
      el.querySelector('#addcity').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const v = ev.target.preset.value;
        let city = CITY_PRESETS.find((p) => p.name === v);
        if (v === '__other') {
          const r = await modal('Add a city', `<label>City name<input name="name" required></label>
            <label>Time zone<select name="tz">${TZ_CHOICES.map(([z, n]) => `<option value="${z}">${esc(n)}</option>`).join('')}</select></label>`,
          [{ label: 'Cancel', value: false }, { label: 'Add', value: true, cls: 'primary' }]);
          if (!r.value || !r.data.name.trim()) return;
          city = { name: r.data.name.trim(), tz: r.data.tz, lat: null, lon: null };
          try { const g = await geocode(city.name); if (g) { city.lat = g.lat; city.lon = g.lng; } } catch { /* weather will be missing for this city */ }
        }
        if (!city) return;
        store.update(['trips', state.code], { cities: [...(t.cities || []), city] });
        setTimeout(() => hooks.refreshView(), 100);
      });

      el.querySelector('#addmember').addEventListener('click', async () => {
        const r = await modal('Add a person', '<label>Name<input name="name" required></label>', [{ label: 'Cancel', value: false }, { label: 'Add', value: true, cls: 'primary' }]);
        if (!r.value || !r.data.name.trim()) return;
        store.update(['trips', state.code], { members: [...t.members, { id: uid(), name: r.data.name.trim() }] });
        setTimeout(() => hooks.refreshView(), 100);
      });
      el.querySelector('#savemembers').addEventListener('click', () => {
        const members = t.members.map((m) => ({ ...m, name: el.querySelector(`[data-member="${m.id}"]`).value.trim() || m.name }));
        store.update(['trips', state.code], { members });
        toast('Names saved');
      });
      el.querySelectorAll('[data-delmember]').forEach((b) => b.addEventListener('click', async () => {
        const id = b.dataset.delmember;
        if (id === state.me) { toast("You can't remove yourself"); return; }
        const m = t.members.find((x) => x.id === id);
        if (!(await confirmBox(`Remove ${m.name} from the trip?`, 'Remove'))) return;
        store.update(['trips', state.code], { members: t.members.filter((x) => x.id !== id) });
        for (const e of state.events.filter((x) => x.attendees?.includes(id))) store.update(['trips', state.code, 'events', e.id], { attendees: e.attendees.filter((a) => a !== id) });
        setTimeout(() => hooks.refreshView(), 100);
      }));

      el.querySelector('#export').addEventListener('click', () => {
        const data = { app: 'family-trip', version: 1, exportedAt: new Date().toISOString(), trip: clean(t),
          events: state.events.map((e) => ({ id: e.id, ...clean(e) })), wishlist: state.wish.map((w) => ({ id: w.id, ...clean(w) })), hotels: state.hotels.map((h) => ({ id: h.id, ...clean(h) })) };
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        a.download = `${t.name.replace(/[^\w]+/g, '-')}-backup.json`;
        a.click();
      });
      el.querySelector('#import').addEventListener('change', async (ev) => {
        const file = ev.target.files[0];
        if (!file) return;
        try {
          const data = JSON.parse(await file.text());
          const n = (data.events?.length || 0) + (data.wishlist?.length || 0) + (data.hotels?.length || 0);
          if (!n) throw new Error('empty');
          if (!(await confirmBox(`Import ${data.events?.length || 0} plans, ${data.wishlist?.length || 0} wishlist places and ${data.hotels?.length || 0} hotels? Items already here with the same ID are replaced.`, 'Import'))) return;
          importItems(state.code, data, t.members);
          toast('Imported');
        } catch {
          toast('That file is not a trip plan file.');
        }
      });
      el.querySelector('#leave').addEventListener('click', async () => {
        if (!(await confirmBox('Remove this trip from this device? The trip stays saved for everyone else, and you can join again with the code.', 'Remove'))) return;
        device.remove(state.code);
        hooks.closeTrip();
        go('#/trips');
      });
    },
  };
}

// Small helpers shared by every screen.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const clone = (o) => JSON.parse(JSON.stringify(o ?? null));

// Remove helper fields (id, _start...) and undefined values before saving.
export function clean(o) {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) {
    if (k === 'id' || k.startsWith('_') || v === undefined) continue;
    out[k] = v;
  }
  return clone(out);
}

export const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

// ---------- Trip code ----------
// 16 characters from an alphabet without look-alikes (no 0/O, 1/I/L): about 79 bits, impossible to guess.
const ALPH = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function makeCode() {
  const a = new Uint32Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => ALPH[x % ALPH.length]).join('');
}
export const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const fmtCode = (c) => normCode(c).replace(/(.{4})(?=.)/g, '$1-');

// ---------- Cities, time zones, money ----------
export const HOME = { name: 'Dallas', tz: 'America/Chicago' };

export const CITY_PRESETS = [
  { name: 'Taipei', tz: 'Asia/Taipei', lat: 25.033, lon: 121.565 },
  { name: 'Kaohsiung', tz: 'Asia/Taipei', lat: 22.627, lon: 120.301 },
  { name: 'Osaka', tz: 'Asia/Tokyo', lat: 34.694, lon: 135.502 },
  { name: 'Kyoto', tz: 'Asia/Tokyo', lat: 35.012, lon: 135.768 },
  { name: 'Tokyo', tz: 'Asia/Tokyo', lat: 35.681, lon: 139.767 },
  { name: 'Dallas', tz: 'America/Chicago', lat: 32.777, lon: -96.797 },
];

export const TZ_CHOICES = [
  ['Asia/Tokyo', 'Japan'], ['Asia/Taipei', 'Taiwan'], ['America/Chicago', 'US Central (Dallas)'],
  ['America/New_York', 'US Eastern'], ['America/Los_Angeles', 'US Pacific'], ['Pacific/Honolulu', 'Hawaii'],
  ['Asia/Seoul', 'Korea'], ['Asia/Hong_Kong', 'Hong Kong'], ['Asia/Shanghai', 'China'], ['Asia/Bangkok', 'Thailand'],
  ['Asia/Singapore', 'Singapore'], ['Europe/London', 'UK'], ['Europe/Paris', 'Western Europe'], ['America/Mexico_City', 'Mexico'],
];

export const FLAG = { 'Asia/Tokyo': '🇯🇵', 'Asia/Taipei': '🇹🇼', 'America/Chicago': '🇺🇸', 'America/New_York': '🇺🇸', 'America/Los_Angeles': '🇺🇸', 'Pacific/Honolulu': '🇺🇸', 'Asia/Seoul': '🇰🇷', 'Asia/Hong_Kong': '🇭🇰', 'Asia/Shanghai': '🇨🇳', 'Asia/Bangkok': '🇹🇭', 'Asia/Singapore': '🇸🇬', 'Europe/London': '🇬🇧', 'Europe/Paris': '🇪🇺', 'America/Mexico_City': '🇲🇽' };
export const langOfTz = (tz) => (tz === 'Asia/Tokyo' ? 'ja' : tz === 'Asia/Taipei' ? 'zh' : null);
export const curOfTz = (tz) => (tz === 'Asia/Tokyo' ? 'JPY' : tz === 'Asia/Taipei' ? 'TWD' : 'USD');

export function cityOf(trip, name) {
  if (!name) return null;
  return (trip?.cities || []).find((c) => c.name === name) || CITY_PRESETS.find((c) => c.name === name) || null;
}
// The trip's "main" time zone: the first city that is not home.
export function tripTz(trip) {
  const c = (trip?.cities || []).find((x) => x.tz !== HOME.tz);
  return c?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// ---------- Time math (every event time is local to its city) ----------
function tzOffsetMs(tz, utcMs) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}
export function zonedToMs(date, time, tz) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let ms = guess - tzOffsetMs(tz, guess);
  const second = guess - tzOffsetMs(tz, ms);
  if (second !== ms) ms = second;
  return ms;
}
export const eventTz = (trip, e) => cityOf(trip, e.city)?.tz || tripTz(trip);
export const eventStart = (trip, e) => zonedToMs(e.date, e.time || '00:00', eventTz(trip, e));
export function eventEnd(trip, e) {
  if (!e.endTime) return null;
  let ms = zonedToMs(e.date, e.endTime, eventTz(trip, e));
  const s = eventStart(trip, e);
  if (ms < s) ms += 86400000;
  return ms;
}

// "Rough" times from the spreadsheet: shown as words, sorted by these clock times.
export const ROUGH = { Morning: '09:00', Lunch: '12:00', Afternoon: '13:30', Evening: '18:00', 'All day': '00:00', 'Time TBD': '08:00' };

export function fmt12(t) {
  if (!t) return '';
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}
export const timeText = (e) => (e.timeLabel ? e.timeLabel : fmt12(e.time) + (e.endTime ? ' – ' + fmt12(e.endTime) : ''));

export function addDays(date, n) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function tripDays(trip) {
  const out = [];
  if (!trip?.startDate || !trip?.endDate) return out;
  for (let d = trip.startDate; d <= trip.endDate && out.length < 120; d = addDays(d, 1)) out.push(d);
  return out;
}
export const dayLabel = (d, o = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  new Intl.DateTimeFormat('en-US', { ...o, timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'));
export const todayIn = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const clock = (tz, ms = Date.now()) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(ms);
export const clockDay = (tz, ms = Date.now()) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(ms);
export const ago = (ms) => {
  if (!ms) return 'never';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hours ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
export function countdown(ms) {
  const d = ms - Date.now();
  if (d < 60000) return 'starting now';
  const min = Math.round(d / 60000);
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return m ? `in ${h} h ${m} min` : `in ${h} h`;
  const days = Math.floor(h / 24), hr = h % 24;
  if (days < 3 && hr) return `in ${days} day${days > 1 ? 's' : ''} ${hr} h`;
  return `in ${Math.round(h / 24)} days`;
}

// ---------- Google Maps links ----------
// Accepts a pasted link or the text Google Maps shares ("Name\nAddress\nhttps://maps.app.goo.gl/...").
export function parseMapsInput(text) {
  text = String(text || '').trim();
  const url = (text.match(/https?:\/\/\S+/) || [''])[0];
  const lines = text.replace(url, '').split(/\n/).map((s) => s.trim()).filter(Boolean);
  let name = lines[0] || '', address = lines.slice(1).join(', '), lat = null, lng = null;
  const dec = (s) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } };
  if (url) {
    let m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (m) { lat = +m[1]; lng = +m[2]; }
    if (lat == null && (m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/))) { lat = +m[1]; lng = +m[2]; }
    let u = null;
    try { u = new URL(url); } catch { /* not a URL */ }
    if (u) {
      const pm = u.pathname.match(/\/maps\/place\/([^/]+)/);
      if (pm && !name) {
        const parts = dec(pm[1]).split(',');
        name = parts[0].trim();
        if (!address) address = parts.slice(1).join(',').trim();
      }
      const q = u.searchParams.get('q') || u.searchParams.get('query') || u.searchParams.get('destination') || u.searchParams.get('ll');
      if (q) {
        const c = q.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/);
        if (c) { if (lat == null) { lat = +c[1]; lng = +c[2]; } }
        else if (!name) {
          const parts = dec(q).split(',');
          name = parts[0].trim();
          if (!address) address = parts.slice(1).join(',').trim();
        }
      }
    }
  }
  return { name, address, lat, lng, mapsUrl: url };
}

export function mapsLink(loc, fallbackTitle) {
  if (!loc && !fallbackTitle) return '';
  if (loc?.mapsUrl) return loc.mapsUrl;
  const q = [loc?.name || fallbackTitle, loc?.address].filter(Boolean).join(', ');
  if (q) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  if (loc?.lat != null) return `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
  return '';
}

// Free, keyless address lookup (OpenStreetMap). Only used online, when a place has no pin yet.
export async function geocode(q) {
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q), { headers: { 'Accept-Language': 'en' } });
  const a = await r.json();
  return a[0] ? { lat: +a[0].lat, lng: +a[0].lon } : null;
}

// ---------- Weather (Open-Meteo, free, no key; last forecast kept for offline) ----------
const WX = {
  0: ['☀️', 'Sunny'], 1: ['🌤️', 'Mostly sunny'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Cloudy'], 45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'],
  51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Drizzle'], 56: ['🌧️', 'Icy drizzle'], 57: ['🌧️', 'Icy drizzle'],
  61: ['🌧️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'], 66: ['🌧️', 'Icy rain'], 67: ['🌧️', 'Icy rain'],
  71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 77: ['🌨️', 'Snow'], 80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'],
  82: ['⛈️', 'Heavy showers'], 85: ['🌨️', 'Snow showers'], 86: ['🌨️', 'Snow showers'], 95: ['⛈️', 'Thunderstorms'], 96: ['⛈️', 'Storms'], 99: ['⛈️', 'Storms'],
};
export async function refreshWeather(trip) {
  if (!navigator.onLine) return false;
  let changed = false;
  for (const c of trip?.cities || []) {
    if (c.lat == null) continue;
    const key = 'tp.wx.' + c.name;
    const old = LS.get(key, null);
    if (old && Date.now() - old.fetchedAt < 3 * 3600e3) continue;
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16&temperature_unit=fahrenheit`);
      const j = await r.json();
      if (j.daily) { LS.set(key, { fetchedAt: Date.now(), daily: j.daily }); changed = true; }
    } catch { /* offline or blocked: keep last forecast */ }
  }
  return changed;
}
export function weatherFor(cityName, date) {
  const w = LS.get('tp.wx.' + cityName, null);
  if (!w) return null;
  const i = w.daily.time.indexOf(date);
  if (i < 0) return null;
  const [icon, text] = WX[w.daily.weather_code[i]] || ['🌡️', ''];
  return { icon, text, hi: Math.round(w.daily.temperature_2m_max[i]), lo: Math.round(w.daily.temperature_2m_min[i]), rain: w.daily.precipitation_probability_max?.[i], fetchedAt: w.fetchedAt };
}

export function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}
export function loadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href;
  document.head.appendChild(l);
}

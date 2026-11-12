// Answers worked out from the itinerary: where are we, what is now / next, which hotel tonight.
import { state, isFor } from './state.js';
import { eventStart, eventEnd, cityOf, tripTz, todayIn, HOME } from './util.js';

export function decorate() {
  if (!state.trip) return;
  for (const e of state.events) {
    try { e._start = eventStart(state.trip, e); e._end = eventEnd(state.trip, e); } catch { e._start = 0; e._end = null; }
  }
  state.events.sort((a, b) => a._start - b._start || String(a.title).localeCompare(b.title));
}

export const dayEvents = (date, who = state.filter) => state.events.filter((e) => e.date === date && isFor(e, who));

// The city you spend most of that day in (later events win ties). Days with nothing planned use the day before.
export function dayCity(date) {
  for (let i = 0, d = date; i < 60; i++) {
    const evs = state.events.filter((e) => e.date === d && e.city);
    if (evs.length) {
      const count = {};
      let best = null;
      for (const e of evs) { count[e.city] = (count[e.city] || 0) + 1; if (!best || count[e.city] >= count[best]) best = e.city; }
      return best;
    }
    if (!state.trip?.startDate || d <= state.trip.startDate) break;
    const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - 1); d = t.toISOString().slice(0, 10);
  }
  return state.trip?.cities?.find((c) => c.tz !== HOME.tz)?.name || state.trip?.cities?.[0]?.name || '';
}

// Where the group is right now: the city of the most recent event that has started.
export function currentCity() {
  const now = Date.now();
  const started = state.events.filter((e) => e.city && e._start <= now);
  const name = started.length ? started[started.length - 1].city : (state.events.find((e) => e.city)?.city || state.trip?.cities?.[0]?.name);
  const c = cityOf(state.trip, name);
  return c ? { name: c.name, tz: c.tz } : { name: '', tz: tripTz(state.trip) };
}

export function nowNext(who) {
  const now = Date.now();
  const evs = state.events.filter((e) => isFor(e, who) && e.timeLabel !== 'All day');
  const nextIdx = evs.findIndex((e) => e._start > now);
  const next = nextIdx >= 0 ? evs[nextIdx] : null;
  const prev = nextIdx === 0 ? null : nextIdx > 0 ? evs[nextIdx - 1] : evs[evs.length - 1];
  let current = null;
  if (prev) {
    const end = prev._end || Math.min(prev._start + 3 * 3600e3, next ? next._start : Infinity);
    if (end > now) current = prev;
  }
  const reminders = state.events.filter((e) => isFor(e, who) && e.important && e._start > now && e._start - (e.reminderMins || 60) * 60000 <= now);
  return { current, next, reminders };
}

export function hotelTonight() {
  const tz = currentCity().tz;
  const today = todayIn(tz);
  const hs = [...state.hotels].sort((a, b) => String(a.checkIn).localeCompare(String(b.checkIn)));
  return hs.find((h) => h.checkIn && h.checkOut && h.checkIn <= today && today <= h.checkOut)
    || hs.find((h) => h.checkIn && h.checkIn >= today) || hs[0] || null;
}

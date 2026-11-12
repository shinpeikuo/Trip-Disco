// What the app currently has open, plus the list of trips this device has joined.
import { LS } from './util.js';

export const state = {
  code: null,      // open trip code
  me: null,        // member id of the person using this device
  trip: null,      // trip document
  events: [],      // itinerary (sorted by start time)
  wish: [],        // wishlist
  hotels: [],
  packing: null,   // this person's packing list
  pendingJoin: null, // { code, trip } while picking a name
  prefill: null,   // place shared into the app from Google Maps
  filter: LS.get('tp.filter', 'all'),
};

// Filled in by app.js so screens can open trips / redraw without circular imports.
export const hooks = { openTrip: null, refresh: null };

export const device = {
  list() { return LS.get('tp.trips', []); },
  save(entry) {
    const l = this.list().filter((t) => t.code !== entry.code);
    l.push(entry);
    LS.set('tp.trips', l);
  },
  remove(code) {
    LS.set('tp.trips', this.list().filter((t) => t.code !== code));
    if (this.current() === code) LS.del('tp.current');
  },
  current() { return LS.get('tp.current', null); },
  setCurrent(code) { LS.set('tp.current', code); },
};

export const go = (hash) => { location.hash = hash; };
export const meName = () => state.trip?.members?.find((m) => m.id === state.me)?.name || '';
export const memberName = (id) => state.trip?.members?.find((m) => m.id === id)?.name || '?';
// Attendee list empty = everyone is going.
export const isFor = (e, id) => !id || id === 'all' || !e.attendees?.length || e.attendees.includes(id);

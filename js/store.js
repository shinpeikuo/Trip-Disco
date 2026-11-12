// The data layer. Two versions with the same functions:
//  - Firebase (shared by the family, works offline and syncs later)
//  - Preview mode (saved only on this device) when js/config.js has no Firebase settings yet.
// Paths are arrays: ['trips', code] is a document, ['trips', code, 'events'] is a list.
import { firebaseConfig } from './config.js';
import { LS, clone, uid } from './util.js';

let impl = null;

export const store = {
  async init() {
    impl = firebaseConfig && firebaseConfig.apiKey ? await firebaseImpl(firebaseConfig) : localImpl();
  },
  get mode() { return impl.mode; },
  watch: (p, cb) => impl.watch(p, cb),
  get: (p) => impl.get(p),
  // Writes are not awaited by the screens: offline they complete when the connection comes back.
  set: (p, d) => impl.set(p, clone(d)),
  update: (p, d) => impl.update(p, clone(d)),
  remove: (p) => impl.remove(p),
  upload: (code, blob, name) => impl.upload(code, blob, name),
  deleteFile: (path) => impl.deleteFile(path),
};

const isDoc = (p) => p.length % 2 === 0;
const safeName = (n) => String(n || 'file').replace(/[^\w.-]+/g, '_').slice(-60);

function report(e) {
  console.error(e);
  window.dispatchEvent(new CustomEvent('tp-error', { detail: e?.message || String(e) }));
}

// ---------------- Firebase ----------------
async function firebaseImpl(cfg) {
  const B = 'https://www.gstatic.com/firebasejs/11.0.2/';
  const [A, F, U, S] = await Promise.all(['app', 'firestore', 'auth', 'storage'].map((n) => import(B + `firebase-${n}.js`)));
  const app = A.initializeApp(cfg);
  let db;
  try {
    db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch {
    db = F.getFirestore(app);
  }
  const auth = U.getAuth(app);
  const user = await new Promise((res) => { const un = U.onAuthStateChanged(auth, (u) => { un(); res(u); }); });
  const signIn = () => U.signInAnonymously(auth).catch((e) => console.warn('Sign-in will retry when online', e));
  if (!user) await signIn();
  window.addEventListener('online', () => { if (!auth.currentUser) signIn(); });
  const storage = S.getStorage(app);
  const ref = (p) => (isDoc(p) ? F.doc(db, ...p) : F.collection(db, ...p));

  return {
    mode: 'firebase',
    watch(p, cb) {
      return F.onSnapshot(ref(p), (s) => cb(isDoc(p) ? (s.exists() ? s.data() : null) : s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.warn(p.join('/'), e));
    },
    async get(p) {
      let s;
      try { s = await F.getDoc(ref(p)); } catch { s = await F.getDocFromCache(ref(p)); }
      return s.exists() ? s.data() : null;
    },
    set: (p, d) => F.setDoc(ref(p), d).catch(report),
    update: (p, d) => F.setDoc(ref(p), d, { merge: true }).catch(report),
    remove: (p) => F.deleteDoc(ref(p)).catch(report),
    async upload(code, blob, name) {
      if (!auth.currentUser) await U.signInAnonymously(auth);
      const path = `trips/${code}/${uid()}-${safeName(name)}`;
      const r = S.ref(storage, path);
      await S.uploadBytes(r, blob, { contentType: blob.type || 'application/octet-stream' });
      return { path, url: await S.getDownloadURL(r) };
    },
    async deleteFile(path) {
      if (!path) return;
      try { await S.deleteObject(S.ref(storage, path)); } catch (e) { console.warn(e); }
    },
  };
}

// ---------------- Preview mode (this device only) ----------------
function localImpl() {
  const KEY = 'tp.localdb';
  let db = LS.get(KEY, {});
  const listeners = new Set();
  const save = () => { LS.set(KEY, db); };
  const snapshot = (p) => {
    const key = p.join('/');
    if (isDoc(p)) return db[key] ? clone(db[key]) : null;
    const pre = key + '/';
    return Object.keys(db).filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map((k) => ({ id: k.slice(pre.length), ...clone(db[k]) }));
  };
  const notify = (changedKey) => {
    for (const l of listeners) {
      const key = l.p.join('/');
      if (changedKey === key || changedKey.startsWith(key + '/')) l.cb(snapshot(l.p));
    }
  };
  const merge = (a, b) => {
    const out = { ...(a || {}) };
    for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(out[k], v) : v;
    return out;
  };
  const later = (fn) => Promise.resolve().then(fn);
  return {
    mode: 'local',
    watch(p, cb) {
      const l = { p, cb };
      listeners.add(l);
      later(() => cb(snapshot(p)));
      return () => listeners.delete(l);
    },
    async get(p) { return snapshot(p); },
    set: (p, d) => later(() => { db[p.join('/')] = d; save(); notify(p.join('/')); }),
    update: (p, d) => later(() => { db[p.join('/')] = merge(db[p.join('/')], d); save(); notify(p.join('/')); }),
    remove: (p) => later(() => { delete db[p.join('/')]; save(); notify(p.join('/')); }),
    async upload(code, blob) {
      // Preview mode keeps files inside the browser, so shrink pictures to stay small.
      const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
      return { path: '', url };
    },
    async deleteFile() {},
  };
}

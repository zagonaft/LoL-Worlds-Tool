// Data layer. Two interchangeable backends with the same interface:
//   - FirebaseStore: shared, live data in Cloud Firestore (used when config.js has a config)
//   - LocalStore:    demo mode, data only lives in this browser (localStorage)
//
// Interface:
//   watchDoc(path, cb) / watchCol(path, cb) → unsubscribe()
//   get(path) → doc or null
//   set(path, data, { merge }) → Promise
//   remove(path) → Promise
// Documents are plain objects; collection callbacks receive [{ id, ...data }].

const FIREBASE_VERSION = '12.19.0';

export async function createStore(config) {
  if (config && config.apiKey) return createFirebaseStore(config);
  return createLocalStore();
}

// ---------------------------------------------------------------------------
// Firebase
// ---------------------------------------------------------------------------
async function createFirebaseStore(config) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const { initializeApp } = await import(`${base}/firebase-app.js`);
  const fs = await import(`${base}/firebase-firestore.js`);

  const app = initializeApp(config);
  let db;
  try {
    db = fs.initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch {
    db = fs.initializeFirestore(app, { ignoreUndefinedProperties: true });
  }
  // For local testing against the Firestore emulator: ?emulator=localhost:8080
  const emu = new URLSearchParams(location.search).get('emulator');
  if (emu) {
    const [host, port] = emu.split(':');
    fs.connectFirestoreEmulator(db, host, Number(port));
  }

  const toDoc = (snap) => (snap.exists() ? { id: snap.id, ...snap.data() } : null);
  const errorHandlers = new Set();
  const onError = (err) => errorHandlers.forEach((fn) => fn(err));

  return {
    mode: 'firebase',
    onError: (fn) => errorHandlers.add(fn),
    watchDoc(path, cb) {
      return fs.onSnapshot(fs.doc(db, path), (s) => {
        // "Doesn't exist" from the offline cache isn't trustworthy: wait for the server.
        if (!s.exists() && s.metadata.fromCache) return;
        cb(toDoc(s));
      }, onError);
    },
    watchCol(path, cb) {
      return fs.onSnapshot(fs.collection(db, path), (qs) => cb(qs.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
    },
    async get(path) {
      return toDoc(await fs.getDoc(fs.doc(db, path)));
    },
    set(path, data, opts = {}) {
      return fs.setDoc(fs.doc(db, path), data, { merge: !!opts.merge });
    },
    remove(path) {
      return fs.deleteDoc(fs.doc(db, path));
    },
  };
}

// ---------------------------------------------------------------------------
// Local demo store (localStorage + BroadcastChannel so several tabs stay in sync)
// ---------------------------------------------------------------------------
const LS_KEY = 'lwt-demo-db';

function clean(value) {
  // Mimic Firestore: drop undefined, deep-copy everything else.
  return JSON.parse(JSON.stringify(value ?? null));
}

function deepMerge(target, patch) {
  const out = { ...(target || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function createLocalStore() {
  let data = {};
  const load = () => {
    try { data = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { data = {}; }
  };
  load();
  const listeners = new Set();
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(LS_KEY) : null;

  const docAt = (path) => (data[path] ? { id: path.split('/').pop(), ...clean(data[path]) } : null);
  const colAt = (path) => {
    const depth = path.split('/').length + 1;
    return Object.keys(data)
      .filter((k) => k.startsWith(path + '/') && k.split('/').length === depth)
      .map((k) => docAt(k));
  };
  const fire = (l) => l.cb(l.type === 'doc' ? docAt(l.path) : colAt(l.path));
  const emit = () => listeners.forEach((l) => queueMicrotask(() => listeners.has(l) && fire(l)));

  if (channel) channel.onmessage = () => { load(); emit(); };
  window.addEventListener('storage', (e) => { if (e.key === LS_KEY) { load(); emit(); } });

  const save = () => {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    channel?.postMessage('changed');
    emit();
  };

  // Same lock rules as firestore.rules, so demo mode behaves like the real thing.
  const checkWrite = (path, value) => {
    const parts = path.split('/');
    const leaguePath = parts.slice(0, 2).join('/');
    const league = data[leaguePath];
    const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    if (parts[2] === 'picks') {
      const match = data[`${leaguePath}/matches/${value.matchId}`];
      if (!match || match.locked || !(Date.now() < match.startMs)) throw denied();
    }
    const lockKey = parts[2] === 'predictions' ? 'predictionsLockMs' : parts[2] === 'brackets' ? 'knockoutLockMs' : null;
    if (lockKey) {
      const ms = league?.settings?.[lockKey];
      if (ms != null && !(Date.now() < ms)) throw denied();
    }
  };

  return {
    mode: 'local',
    onError() {},
    watchDoc(path, cb) {
      const l = { type: 'doc', path, cb };
      listeners.add(l);
      queueMicrotask(() => listeners.has(l) && fire(l));
      return () => listeners.delete(l);
    },
    watchCol(path, cb) {
      const l = { type: 'col', path, cb };
      listeners.add(l);
      queueMicrotask(() => listeners.has(l) && fire(l));
      return () => listeners.delete(l);
    },
    async get(path) {
      return docAt(path);
    },
    async set(path, value, opts = {}) {
      const v = clean(value);
      const merged = opts.merge ? deepMerge(data[path], v) : v;
      checkWrite(path, merged);
      data[path] = merged;
      save();
    },
    async remove(path) {
      delete data[path];
      save();
    },
  };
}

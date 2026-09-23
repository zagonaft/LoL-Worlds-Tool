// Tiny Firestore client for Node, using the public REST API. Same interface as
// the app's store (get / list / set with merge), so the robot can reuse the
// app's own sync and auto-fill code. It goes through the same security rules
// as the website, so it can't do anything a player couldn't.

const SIMPLE_KEY = /^[A-Za-z_][A-Za-z_0-9]*$/;

export function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isSafeInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: toFields(v) } };
}

export function toFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = toValue(v);
  return out;
}

export function fromValue(v) {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return null;
}

export function fromFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, fromValue(v)]));
}

const quote = (key) => (SIMPLE_KEY.test(key) ? key : `\`${key.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\``);

// Field paths touched by a merge write: nested objects merge, everything else replaces.
export function maskPaths(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const path = prefix + quote(k);
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) out.push(...maskPaths(v, `${path}.`));
    else out.push(path);
  }
  return out;
}

export function createRestStore({ projectId, apiKey, emulatorHost }) {
  const root = emulatorHost ? `http://${emulatorHost}` : 'https://firestore.googleapis.com';
  const base = `${root}/v1/projects/${projectId}/databases/(default)/documents`;
  const url = (path, params = []) => {
    const u = new URL(`${base}/${path}`);
    if (apiKey && !emulatorHost) u.searchParams.set('key', apiKey);
    for (const [k, v] of params) u.searchParams.append(k, v);
    return u;
  };
  const request = async (u, opts = {}) => {
    const res = await fetch(u, { ...opts, headers: { 'content-type': 'application/json' } });
    if (res.status === 404) return null;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Firestore ${res.status}: ${body.error?.message || res.statusText}`);
    return body;
  };
  const toDoc = (d) => ({ id: d.name.split('/').pop(), ...fromFields(d.fields) });

  return {
    mode: 'rest',
    async get(path) {
      const d = await request(url(path));
      return d ? toDoc(d) : null;
    },
    async list(path) {
      const docs = [];
      let pageToken = '';
      do {
        const params = [['pageSize', '300']];
        if (pageToken) params.push(['pageToken', pageToken]);
        const body = await request(url(path, params));
        docs.push(...(body?.documents || []).map(toDoc));
        pageToken = body?.nextPageToken || '';
      } while (pageToken);
      return docs;
    },
    async set(path, data, opts = {}) {
      const params = opts.merge ? maskPaths(data).map((p) => ['updateMask.fieldPaths', p]) : [];
      await request(url(path, params), { method: 'PATCH', body: JSON.stringify({ fields: toFields(data) }) });
    },
  };
}

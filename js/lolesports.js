// Client for the (unofficial) LoL Esports API: the same public endpoints the
// lolesports.com website uses. Riot can change these at any time, so every
// feature built on them has a manual fallback in the app.

const API = 'https://esports-api.lolesports.com/persisted/gw';
const FEED = 'https://feed.lolesports.com/livestats/v1';
// Public key embedded in lolesports.com itself (not a secret).
const API_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';

export const WORLDS_LEAGUE_ID = '98767975604431411';
export const WORLDS_SLUG = 'worlds';

async function api(endpoint, params = {}) {
  const url = new URL(`${API}/${endpoint}`);
  url.searchParams.set('hl', 'en-US');
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'x-api-key': API_KEY } });
  if (!res.ok) throw new Error(`LoL Esports API error ${res.status}`);
  return (await res.json()).data;
}

export async function getLiveEvents() {
  const data = await api('getLive');
  return (data?.schedule?.events || []).filter((e) => e.match);
}

export async function getEventDetails(matchId) {
  const data = await api('getEventDetails', { id: matchId });
  return data?.event || null;
}

// All Worlds matches since `sinceMs`. The schedule is paged around "now".
export async function getScheduleEvents(sinceMs, leagueId = WORLDS_LEAGUE_ID) {
  const first = await api('getSchedule', { leagueId });
  const events = [...(first?.schedule?.events || [])];
  let newer = first?.schedule?.pages?.newer;
  let older = first?.schedule?.pages?.older;
  for (let i = 0; newer && i < 10; i++) {
    const d = await api('getSchedule', { leagueId, pageToken: newer });
    events.push(...(d?.schedule?.events || []));
    newer = d?.schedule?.pages?.newer;
  }
  for (let i = 0; older && i < 10; i++) {
    const oldest = Math.min(...events.map((e) => Date.parse(e.startTime)));
    if (oldest < sinceMs) break;
    const d = await api('getSchedule', { leagueId, pageToken: older });
    events.push(...(d?.schedule?.events || []));
    older = d?.schedule?.pages?.older;
  }
  const seen = new Set();
  return events
    .filter((e) => e.match?.id && Date.parse(e.startTime) >= sinceMs)
    .filter((e) => (seen.has(e.match.id) ? false : seen.add(e.match.id)))
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
}

// ---------- schedule → app matches ----------

export function stageFromBlock(blockName = '') {
  const b = blockName.toLowerCase();
  if (b.includes('play')) return 'playin';
  if (/quarter|semi|final/.test(b)) return 'knockout';
  return 'swiss';
}

export function knockoutRound(blockName = '') {
  const b = blockName.toLowerCase();
  if (b.includes('play')) return null;
  if (b.includes('quarter')) return 'QF';
  if (b.includes('semi')) return 'SF';
  if (b.includes('final')) return 'F';
  return null;
}

export function eventToMatch(ev) {
  const [a, b] = ev.match.teams || [];
  const team = (t) => ({ code: t?.code && t.code !== 'TBD' ? t.code : 'TBD', name: t?.name || 'TBD', image: t?.image || null });
  return {
    esportsMatchId: ev.match.id,
    teamA: team(a),
    teamB: team(b),
    bestOf: ev.match.strategy?.count || 1,
    startMs: Date.parse(ev.startTime),
    stage: stageFromBlock(ev.blockName),
    label: ev.blockName || '',
    round: knockoutRound(ev.blockName),
    state: ev.state, // 'unstarted' | 'inProgress' | 'completed'
    scoreA: a?.result?.gameWins ?? 0,
    scoreB: b?.result?.gameWins ?? 0,
  };
}

// ---------- live stats ----------

export const roundTo10s = (ms) => Math.floor(ms / 10000) * 10000;

export async function getWindow(gameId, startingMs) {
  const url = new URL(`${FEED}/window/${gameId}`);
  if (startingMs != null) url.searchParams.set('startingTime', new Date(roundTo10s(startingMs)).toISOString());
  const res = await fetch(url);
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Live stats error ${res.status}`);
  const text = await res.text();
  if (!text) return null;
  const json = JSON.parse(text);
  return json?.frames?.length ? json : null;
}

const teamStats = (t = {}) => ({
  kills: t.totalKills ?? 0,
  gold: t.totalGold ?? 0,
  towers: t.towers ?? 0,
  inhibitors: t.inhibitors ?? 0,
  barons: t.barons ?? 0,
  dragons: t.dragons || [],
});

export function parseWindow(w, detailTeams = []) {
  if (!w?.frames?.length) return null;
  const f = w.frames[w.frames.length - 1];
  const byId = new Map(detailTeams.map((t) => [t.id, t]));
  const blue = byId.get(w.gameMetadata?.blueTeamMetadata?.esportsTeamId);
  const red = byId.get(w.gameMetadata?.redTeamMetadata?.esportsTeamId);
  return {
    gameState: f.gameState,
    at: Date.parse(f.rfc460Timestamp),
    blue: { ...teamStats(f.blueTeam), code: blue?.code || 'BLUE' },
    red: { ...teamStats(f.redTeam), code: red?.code || 'RED' },
  };
}

// What's live right now. Returns null when nothing is live.
export async function getLiveSnapshot({ anyLeague = false } = {}) {
  const events = await getLiveEvents();
  const live = events.filter((e) => e.state === 'inProgress' && (anyLeague || e.league?.slug === WORLDS_SLUG));
  if (!live.length) return null;
  const ev = live.find((e) => e.league?.slug === WORLDS_SLUG) || live[0];
  const snap = {
    esportsMatchId: ev.match.id,
    league: ev.league?.name || '',
    isWorlds: ev.league?.slug === WORLDS_SLUG,
    blockName: ev.blockName || '',
    bestOf: ev.match.strategy?.count || 1,
    teams: (ev.match.teams || []).map((t) => ({ code: t.code, name: t.name, image: t.image, wins: t.result?.gameWins ?? 0 })),
    gameNumber: null,
    stats: null,
  };
  try {
    const details = await getEventDetails(ev.match.id);
    const game = (details?.match?.games || []).find((g) => g.state === 'inProgress');
    if (game) {
      snap.gameNumber = game.number;
      // Live data is only served ~60 seconds behind real time.
      snap.stats = parseWindow(await getWindow(game.id, Date.now() - 60000), details.match.teams || []);
    }
  } catch {
    // Game stats are a bonus; the series score is enough for the widget.
  }
  return snap;
}

// ---------- autofill a finished game ----------
// The live feed only has running totals (kills, towers, ...) per ~10 second
// window. Every counter only goes up, so we binary-search through the game's
// timeline to find the moment each one first became non-zero.

const COUNTERS = {
  firstBlood: (t) => t?.totalKills ?? 0,
  firstDragon: (t) => (t?.dragons || []).length,
  firstTower: (t) => t?.towers ?? 0,
  firstBaron: (t) => t?.barons ?? 0,
};

export async function analyzeGame(gameId, { onProgress } = {}) {
  const cache = new Map();
  let calls = 0;
  const probe = (ms) => {
    const t = roundTo10s(ms);
    if (!cache.has(t)) {
      calls++;
      onProgress?.(calls);
      cache.set(t, getWindow(gameId, t));
    }
    return cache.get(t);
  };
  const stamp = (f) => Date.parse(f.rfc460Timestamp);

  const first = await getWindow(gameId);
  if (!first) throw new Error('No live stats available for this game.');
  const startMs = stamp(first.frames[0]);
  const latest = Date.now() - 60000;

  // 1) Find when the game ended.
  const isOver = (w, t) => !w || w.frames.some((f) => f.gameState === 'finished') || stamp(w.frames.at(-1)) < t - 60000;
  let lo = startMs;
  let hi = null;
  for (let t = startMs + 10 * 60000; t <= startMs + 100 * 60000 && t <= latest; t += 10 * 60000) {
    if (isOver(await probe(t), t)) { hi = t; break; }
    lo = t;
  }
  if (hi == null) throw new Error('This game does not look finished yet.');
  while (hi - lo > 10000) {
    const mid = roundTo10s((lo + hi) / 2);
    if (mid <= lo || mid >= hi) break;
    if (isOver(await probe(mid), mid)) hi = mid; else lo = mid;
  }
  const wHi = await probe(hi);
  const wLo = await probe(lo);
  const endFrame = wHi?.frames.find((f) => f.gameState === 'finished') || wLo?.frames.at(-1) || first.frames.at(-1);
  const endMs = stamp(endFrame);

  // 2) Find who got each "first".
  const out = {};
  for (const [key, count] of Object.entries(COUNTERS)) {
    const total = (f) => count(f.blueTeam) + count(f.redTeam);
    if (total(endFrame) === 0) { out[key] = 'none'; continue; }
    const firstHit = (w) => w?.frames.find((f) => total(f) > 0) || null;
    let a = startMs;
    let b = endMs;
    let hit = firstHit(first);
    while (!hit && b - a > 10000) {
      const mid = roundTo10s((a + b) / 2);
      if (mid <= a || mid >= b) break;
      const w = await probe(mid);
      if (!w || total(w.frames[0]) > 0) b = mid;
      else if (firstHit(w)) hit = firstHit(w);
      else a = mid;
    }
    hit = hit || firstHit(await probe(a)) || firstHit(await probe(b));
    if (!hit) { out[key] = null; continue; }
    const blue = count(hit.blueTeam) > 0;
    const red = count(hit.redTeam) > 0;
    out[key] = blue && !red ? 'blue' : red && !blue ? 'red' : null; // null = same frame, can't tell
  }

  const bt = endFrame.blueTeam || {};
  const rt = endFrame.redTeam || {};
  const cmp = [(t) => t.inhibitors ?? 0, (t) => t.towers ?? 0, (t) => t.totalGold ?? 0]
    .map((fn) => fn(bt) - fn(rt))
    .find((d) => d !== 0) || 0;
  return {
    ...out,
    blueTeamId: first.gameMetadata?.blueTeamMetadata?.esportsTeamId,
    redTeamId: first.gameMetadata?.redTeamMetadata?.esportsTeamId,
    durationSec: Math.round((endMs - startMs) / 1000),
    totalKills: (bt.totalKills ?? 0) + (rt.totalKills ?? 0),
    winnerGuess: cmp > 0 ? 'blue' : cmp < 0 ? 'red' : null,
    calls,
  };
}

// Fill one game of one of our matches. Returns values using 'A'/'B' sides.
export async function autofillGame(match, gameNumber, opts) {
  if (!match.esportsMatchId) throw new Error('This match is not linked to LoL Esports (no match ID).');
  const details = await getEventDetails(match.esportsMatchId);
  const games = details?.match?.games || [];
  const game = games.find((g) => g.number === gameNumber);
  if (!game) throw new Error(`Game ${gameNumber} not found on LoL Esports.`);
  if (game.state !== 'completed') throw new Error(`Game ${gameNumber} is not completed yet (${game.state}).`);
  const r = await analyzeGame(game.id, opts);

  const teams = details.match.teams || [];
  const sideTeamId = (side) =>
    (side === 'blue' ? r.blueTeamId : r.redTeamId) || game.teams?.find((t) => t.side === side)?.id;
  const toAB = (side) => {
    if (side === 'none') return 'none';
    if (side !== 'blue' && side !== 'red') return null;
    const id = sideTeamId(side);
    const t = teams.find((x) => x.id === id);
    const code = String(t?.code || '').toUpperCase();
    if (code && code === String(match.teamA).toUpperCase()) return 'A';
    if (code && code === String(match.teamB).toUpperCase()) return 'B';
    const idx = teams.indexOf(t);
    return idx === 0 ? 'A' : idx === 1 ? 'B' : null;
  };
  return {
    winner: toAB(r.winnerGuess),
    firstBlood: toAB(r.firstBlood),
    firstDragon: toAB(r.firstDragon),
    firstTower: toAB(r.firstTower),
    firstBaron: toAB(r.firstBaron),
    durationSec: r.durationSec,
    totalKills: r.totalKills,
    calls: r.calls,
  };
}

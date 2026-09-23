// Pure scoring logic: no DOM and no database, so it can be unit-tested with Node.
// A "side" is always 'A' or 'B' (team A / team B of a match), never a team code,
// so picks stay valid even if a team gets renamed.
import { GAME_PROPS, BRACKET_SLOTS } from './defaults.js';

export const FEEDERS = { SF1: ['QF1', 'QF2'], SF2: ['QF3', 'QF4'], F: ['SF1', 'SF2'] };

// ---------- small helpers ----------

export function lengthBucket(durationSec, buckets) {
  if (durationSec == null || durationSec === '' || !Number.isFinite(Number(durationSec))) return null;
  const minutes = Number(durationSec) / 60;
  let i = 0;
  while (i < buckets.length && minutes >= buckets[i]) i++;
  return i;
}

export function lengthLabels(buckets) {
  return Array.from({ length: buckets.length + 1 }, (_, i) => {
    if (i === 0) return `Under ${buckets[0]}m`;
    if (i === buckets.length) return `${buckets[i - 1]}m+`;
    return `${buckets[i - 1]}–${buckets[i]}m`;
  });
}

export function killsResult(totalKills, line) {
  if (totalKills == null || totalKills === '' || !Number.isFinite(Number(totalKills))) return null;
  const k = Number(totalKills);
  if (k > line) return 'over';
  if (k < line) return 'under';
  return 'push';
}

// All possible final scores of a series, from team A's point of view.
// seriesScores(5) → ['3-0', '3-1', '3-2', '2-3', '1-3', '0-3']
export function seriesScores(bestOf) {
  const need = Math.ceil(bestOf / 2);
  const out = [];
  for (let l = 0; l < need; l++) out.push(`${need}-${l}`);
  for (let l = need - 1; l >= 0; l--) out.push(`${l}-${need}`);
  return out;
}

// possibleTotals(5) → [3, 4, 5]
export function possibleTotals(bestOf) {
  const need = Math.ceil(bestOf / 2);
  const out = [];
  for (let n = need; n <= bestOf; n++) out.push(n);
  return out;
}

// "31:45" → 1905, "31" → 1860, "" → null
export function parseDuration(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,3})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const sec = m[2] == null ? 0 : Number(m[2]);
  if (sec > 59) return null;
  return Number(m[1]) * 60 + sec;
}

export function formatDuration(sec) {
  if (sec == null || !Number.isFinite(Number(sec))) return '';
  const s = Math.round(Number(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function sideCode(match, side) {
  if (side === 'A') return match.teamA;
  if (side === 'B') return match.teamB;
  return null;
}

// ---------- match state ----------

export function seriesResult(match) {
  const r = match?.result;
  if (!r || r.status !== 'final') return null;
  const a = Number(r.scoreA);
  const b = Number(r.scoreB);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
  return { winner: a > b ? 'A' : 'B', score: `${a}-${b}`, totalGames: a + b };
}

// 'open' (bets allowed) | 'locked' (started, no result yet) | 'live' | 'final'
export function matchStatus(match, now = Date.now()) {
  const st = match?.result?.status;
  if (st === 'final') return 'final';
  if (st === 'live') return 'live';
  if (match.locked || !(now < Number(match.startMs))) return 'locked';
  return 'open';
}

export function isMatchOpen(match, now = Date.now()) {
  return matchStatus(match, now) === 'open';
}

export function gameActual(game, key, settings) {
  if (!game) return null;
  if (key === 'length') return lengthBucket(game.durationSec, settings.lengthBuckets);
  if (key === 'kills') return killsResult(game.totalKills, settings.killsLine);
  return game[key] ?? null;
}

// ---------- scoring ----------

function item(key, category, pick, actual, status, points, game = null) {
  return { key, category, game, pick, actual, status, points: status === 'won' ? points : 0 };
}

function resolve(pick, actual) {
  if (actual == null) return 'pending';
  return String(pick) === String(actual) ? 'won' : 'lost';
}

// Scores one player's picks for one match.
export function scoreMatchPick(match, pick, settings) {
  const P = settings.points;
  const items = [];
  if (!match || !pick) return summarize(items);
  const sr = seriesResult(match);

  if (pick.winner) items.push(item('winner', 'series', pick.winner, sr?.winner ?? null, resolve(pick.winner, sr?.winner), P.winner));
  if (match.bestOf > 1) {
    if (pick.score) items.push(item('score', 'series', pick.score, sr?.score ?? null, resolve(pick.score, sr?.score), P.score));
    if (pick.totalGames) items.push(item('totalGames', 'series', pick.totalGames, sr?.totalGames ?? null, resolve(pick.totalGames, sr?.totalGames), P.totalGames));
  }

  const games = match.result?.games || [];
  for (let n = 1; n <= (match.bestOf || 1); n++) {
    const gp = pick.games?.[n];
    if (!gp) continue;
    const game = games[n - 1];
    for (const prop of GAME_PROPS) {
      const v = gp[prop.key];
      if (v == null || v === '') continue;
      const actual = gameActual(game, prop.key, settings);
      let status;
      if (actual === 'push') status = 'void';
      else if (actual != null) status = resolve(v, actual);
      else if (sr && n > sr.totalGames) status = 'void'; // game was never played
      else status = 'pending';
      items.push(item(prop.key, 'props', v, actual, status, P[prop.key], n));
    }
  }
  return summarize(items);
}

export function summarize(items) {
  let points = 0;
  let correct = 0;
  let settled = 0;
  for (const it of items) {
    points += it.points;
    if (it.status === 'won') correct++;
    if (it.status === 'won' || it.status === 'lost') settled++;
  }
  return { points, correct, settled, items };
}

// Where every knockout slot stands, based on matches tagged with a bracketSlot.
export function bracketState(matches) {
  const state = {};
  const bySlot = new Map();
  for (const m of matches) if (m.bracketSlot) bySlot.set(m.bracketSlot, m);
  for (const slot of BRACKET_SLOTS) {
    const m = bySlot.get(slot);
    let teams = [null, null];
    if (m) teams = [m.teamA || null, m.teamB || null].map((c) => (c && c !== 'TBD' ? c : null));
    if (FEEDERS[slot]) {
      const [f1, f2] = FEEDERS[slot];
      teams = [teams[0] || state[f1]?.winner || null, teams[1] || state[f2]?.winner || null];
    }
    const sr = m ? seriesResult(m) : null;
    const winner = sr ? sideCode(m, sr.winner) : null;
    const loser = sr ? sideCode(m, sr.winner === 'A' ? 'B' : 'A') : null;
    state[slot] = { matchId: m?.id ?? null, teams, winner, loser };
  }
  return state;
}

export function knockoutEliminated(bstate) {
  return new Set(Object.values(bstate).map((s) => s.loser).filter(Boolean));
}

// Tournament-wide predictions: champion + Swiss stage pick'em.
// actual = { champion, swiss30: [], swiss03: [], swissAdvance: [], swissDone, eliminated: Set }
export function scorePredictions(pred, actual, points) {
  const items = [];
  if (!pred) return summarize(items);
  const a = actual || {};
  const s30 = a.swiss30 || [];
  const s03 = a.swiss03 || [];
  const qualified = new Set([...s30, ...(a.swissAdvance || [])]);
  const eliminated = a.eliminated || new Set();

  if (pred.champion) {
    let status = 'pending';
    if (a.champion) status = a.champion === pred.champion ? 'won' : 'lost';
    else if (eliminated.has(pred.champion) || s03.includes(pred.champion) || (a.swissDone && !qualified.has(pred.champion))) status = 'lost';
    items.push(item('champion', 'predictions', pred.champion, a.champion ?? null, status, points.champion));
  }
  const rec = (code) => a.records?.get(code) || { w: 0, l: 0 };
  for (const code of (pred.swiss30 || []).filter(Boolean)) {
    let status = 'pending';
    if (s30.includes(code)) status = 'won';
    else if (a.swissDone || s30.length >= 2 || rec(code).l > 0) status = 'lost';
    items.push(item('swiss30', 'predictions', code, null, status, points.swiss30));
  }
  for (const code of (pred.swiss03 || []).filter(Boolean)) {
    let status = 'pending';
    if (s03.includes(code)) status = 'won';
    else if (a.swissDone || s03.length >= 2 || rec(code).w > 0) status = 'lost';
    items.push(item('swiss03', 'predictions', code, null, status, points.swiss03));
  }
  for (const code of (pred.swissAdvance || []).filter(Boolean)) {
    let status = 'pending';
    if (qualified.has(code)) status = 'won';
    else if (a.swissDone || s03.includes(code) || eliminated.has(code)) status = 'lost';
    items.push(item('swissAdvance', 'predictions', code, null, status, points.swissAdvance));
  }
  return summarize(items);
}

export function slotPointsKey(slot) {
  if (slot.startsWith('QF')) return 'bracketQF';
  if (slot.startsWith('SF')) return 'bracketSF';
  return 'bracketF';
}

export function scoreBracket(bracket, bstate, points) {
  const items = [];
  const picks = bracket?.picks || {};
  const eliminated = knockoutEliminated(bstate);
  for (const slot of BRACKET_SLOTS) {
    const pick = picks[slot];
    if (!pick) continue;
    const actual = bstate[slot]?.winner ?? null;
    let status = 'pending';
    if (actual) status = actual === pick ? 'won' : 'lost';
    else if (eliminated.has(pick)) status = 'lost';
    const key = slotPointsKey(slot);
    items.push({ ...item(key, 'bracket', pick, actual, status, points[key]), slot });
  }
  return summarize(items);
}

// Each team's win/loss record in finished Swiss matches.
export function swissRecords(matches) {
  const rec = new Map();
  const bump = (code, key) => {
    if (!code || code === 'TBD') return;
    if (!rec.has(code)) rec.set(code, { w: 0, l: 0 });
    rec.get(code)[key]++;
  };
  for (const m of matches) {
    if (m.stage !== 'swiss') continue;
    const sr = seriesResult(m);
    if (!sr) continue;
    bump(sideCode(m, sr.winner), 'w');
    bump(sideCode(m, sr.winner === 'A' ? 'B' : 'A'), 'l');
  }
  return rec;
}

// Swiss outcomes worked out from the match results (3 wins = through, 3 losses = out).
export function derivedSwiss(matches) {
  const rec = swissRecords(matches);
  const out = { swiss30: [], swiss03: [], swissAdvance: [], swissOut: [], swissDone: false };
  let decided = 0;
  for (const [code, { w, l }] of rec) {
    if (w >= 3 && l === 0) out.swiss30.push(code);
    else if (w >= 3) out.swissAdvance.push(code);
    else if (l >= 3 && w === 0) out.swiss03.push(code);
    if (l >= 3) out.swissOut.push(code);
    if (w >= 3 || l >= 3) decided++;
  }
  out.swissDone = rec.size >= 16 && decided === rec.size;
  return out;
}

// The real-world results everything is scored against. Swiss results come
// from the match results automatically; anything an admin set by hand wins.
export function tournamentActual(league, matches) {
  const bstate = bracketState(matches);
  const a = league?.actual || {};
  const d = derivedSwiss(matches);
  const pick = (k) => (a[k]?.length ? a[k] : d[k]);
  return {
    ...a,
    swiss30: pick('swiss30'),
    swiss03: pick('swiss03'),
    swissAdvance: pick('swissAdvance'),
    swissDone: !!a.swissDone || d.swissDone,
    champion: a.champion || bstate.F.winner || null,
    eliminated: new Set([...knockoutEliminated(bstate), ...d.swissOut]),
    records: swissRecords(matches),
    bstate,
  };
}

export function computeStandings({ players, matches, picks, predictions, brackets, league, settings }) {
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const actual = tournamentActual(league, matches);
  const rows = players.map((p) => {
    const row = { player: p, total: 0, series: 0, props: 0, predictions: 0, bracket: 0, correct: 0, settled: 0 };
    const add = (res) => {
      for (const it of res.items) row[it.category] += it.points;
      row.total += res.points;
      row.correct += res.correct;
      row.settled += res.settled;
    };
    for (const pk of picks) {
      if (pk.playerId !== p.id) continue;
      const m = matchById.get(pk.matchId);
      if (m) add(scoreMatchPick(m, pk, settings));
    }
    add(scorePredictions(predictions.find((x) => x.id === p.id), actual, settings.points));
    add(scoreBracket(brackets.find((x) => x.id === p.id), actual.bstate, settings.points));
    return row;
  });
  rows.sort((x, y) => y.total - x.total || y.correct - x.correct || String(x.player.name).localeCompare(String(y.player.name)));
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].total === r.total && rows[i - 1].correct === r.correct ? rows[i - 1].rank : i + 1;
  });
  return rows;
}

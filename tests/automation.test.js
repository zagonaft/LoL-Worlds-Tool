// Tests the automatic results (shared by the app and the GitHub results robot).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autofillMatches, leaguePaths } from '../js/automation.js';
import { toValue, fromValue, maskPaths } from '../scripts/firestore-rest.mjs';

const START = Date.now() - 5 * 3600e3 + 1234;
const END = 30 * 60;

// A fake LoL Esports where the red side gets every "first" and wins.
function mockLoL({ gameState = 'completed' } = {}) {
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls++;
    const url = new URL(String(input));
    if (url.pathname.endsWith('getEventDetails')) {
      return Response.json({ data: { event: { match: {
        teams: [{ id: 'gen', code: 'GEN' }, { id: 'kc', code: 'KC' }],
        games: [1, 2, 3].map((n) => ({ number: n, id: `g${n}`, state: gameState, teams: [{ id: 'kc', side: 'blue' }, { id: 'gen', side: 'red' }] })),
      } } } });
    }
    const st = url.searchParams.get('startingTime');
    let sec = st ? Math.round((Date.parse(st) - START) / 1000) : 0;
    if (sec < 0) sec = 0;
    if (sec > END) return new Response(null, { status: 204 });
    const frames = [];
    for (let s = sec; s < sec + 10 && s <= END; s++) {
      const red = { totalKills: s >= 300 ? 3 : 0, towers: s >= 600 ? 1 : 0, barons: s >= 1200 ? 1 : 0, inhibitors: s >= 1600 ? 1 : 0, totalGold: 3000 + s * 45, dragons: s >= 450 ? ['cloud'] : [] };
      const blue = { totalKills: s >= 900 ? 1 : 0, towers: 0, barons: 0, inhibitors: 0, totalGold: 3000 + s * 40, dragons: [] };
      frames.push({ rfc460Timestamp: new Date(START + s * 1000).toISOString(), gameState: s >= END ? 'finished' : 'in_game', blueTeam: blue, redTeam: red });
    }
    return Response.json({ gameMetadata: { blueTeamMetadata: { esportsTeamId: 'kc' }, redTeamMetadata: { esportsTeamId: 'gen' } }, frames });
  };
  return () => calls;
}

function memoryStore() {
  const writes = [];
  return { writes, async set(path, data, opts) { writes.push({ path, data, opts }); } };
}

const paths = leaguePaths('testLeague');
const match = (extra) => ({ id: 'm1', esportsMatchId: 'lol1', teamA: 'GEN', teamB: 'KC', bestOf: 3, startMs: Date.now() - 6 * 3600e3, ...extra });

test('fills finished games and saves them', async () => {
  mockLoL();
  const store = memoryStore();
  const filled = await autofillMatches({ store, paths, matches: [match({ result: { status: 'final', scoreA: 2, scoreB: 0 } })] });
  assert.equal(filled, 2);
  assert.equal(store.writes.length, 1);
  const [g1, g2] = store.writes[0].data.result.games;
  // GEN (team A) was on red side and got every first.
  assert.deepEqual(
    { winner: g1.winner, fb: g1.firstBlood, fd: g1.firstDragon, ft: g1.firstTower, baron: g1.firstBaron, auto: g1.auto },
    { winner: 'A', fb: 'A', fd: 'A', ft: 'A', baron: 'A', auto: true },
  );
  assert.equal(g2.auto, true);
  assert.equal(store.writes[0].opts.merge, true);
});

test('never overwrites values typed in by hand, and skips games already done', async () => {
  mockLoL();
  const store = memoryStore();
  const games = [{ firstBlood: 'B', auto: false }, { auto: true, firstBlood: 'B' }];
  await autofillMatches({ store, paths, matches: [match({ result: { status: 'final', scoreA: 2, scoreB: 0, games } })] });
  const saved = store.writes[0].data.result.games;
  assert.equal(saved[0].firstBlood, 'B'); // hand-entered value kept
  assert.equal(saved[0].firstDragon, 'A'); // blank filled in
  // Already auto-filled: not fetched again, only the (certain, it's a 2-0) winner is added.
  assert.deepEqual(saved[1], { ...games[1], winner: 'A' });
});

test('ignores matches that are not linked, not started or too old', async () => {
  const calls = mockLoL();
  const store = memoryStore();
  await autofillMatches({ store, paths, matches: [
    match({ esportsMatchId: null, result: { status: 'final', scoreA: 2, scoreB: 0 } }),
    match({ result: null }),
    match({ startMs: Date.now() - 10 * 86400e3, result: { status: 'final', scoreA: 2, scoreB: 0 } }),
  ] });
  assert.equal(store.writes.length, 0);
  assert.equal(calls(), 0);
});

test('waits and retries later when the game data is not ready', async () => {
  mockLoL({ gameState: 'inProgress' });
  const store = memoryStore();
  const logs = [];
  const filled = await autofillMatches({ store, paths, matches: [match({ result: { status: 'live', scoreA: 1, scoreB: 0 } })], log: (m) => logs.push(m) });
  assert.equal(filled, 0);
  assert.equal(store.writes.length, 0);
  assert.match(logs[0], /not filled yet/);
});

test('Firestore REST value encoding round-trips', () => {
  const doc = { a: 1, b: 1.5, c: 'x', d: null, e: true, f: [1, 'two', { g: 3 }], h: { i: { j: 1790139706983 } } };
  assert.deepEqual(fromValue(toValue(doc)), doc);
  assert.deepEqual(toValue(1790139706983), { integerValue: '1790139706983' });
});

test('merge writes only touch the fields being changed', () => {
  assert.deepEqual(maskPaths({ result: { status: 'final', scoreA: 2 }, teams: [1] }), ['result.status', 'result.scoreA', 'teams']);
  assert.deepEqual(maskPaths({ games: { 1: { firstBlood: 'A' } } }), ['games.`1`.firstBlood']);
  assert.deepEqual(maskPaths({ actual: {} }), ['actual']);
});

test('game winners are only taken as certain when they can be known', async () => {
  const { certainWinner } = await import('../js/automation.js');
  // Saw the score go up after game 2.
  assert.equal(certainWinner({ status: 'live', scoreA: 1, scoreB: 1, gameWinners: { 2: 'B' } }, 2), 'B');
  // Sweeps.
  assert.equal(certainWinner({ status: 'live', scoreA: 2, scoreB: 0 }, 1), 'A');
  // Deciding game goes to the series winner.
  assert.equal(certainWinner({ status: 'final', scoreA: 1, scoreB: 3 }, 4), 'B');
  // 3-1 with games 1 and 4 known (A, A) and game 2 known B → game 3 must be A.
  assert.equal(certainWinner({ status: 'final', scoreA: 3, scoreB: 1, gameWinners: { 1: 'A', 2: 'B' } }, 3), 'A');
  // Not enough information: keep the guess.
  assert.equal(certainWinner({ status: 'final', scoreA: 3, scoreB: 1 }, 2), null);
  assert.equal(certainWinner({ status: 'live', scoreA: 1, scoreB: 1 }, 1), null);
});

test('sync records who won a game when the score goes up by one', async () => {
  const { syncSchedule } = await import('../js/sync.js');
  const ev = (a, b, state = 'inProgress') => ({ startTime: new Date(Date.now() - 3600e3).toISOString(), state, blockName: 'Swiss',
    match: { id: 'x1', strategy: { count: 3 }, teams: [{ code: 'T1', name: 'T1', result: { gameWins: a } }, { code: 'GEN', name: 'Gen.G', result: { gameWins: b } }] } });
  let events = [ev(0, 1)];
  globalThis.fetch = async () => Response.json({ data: { schedule: { pages: {}, events } } });
  const writes = [];
  const store = { async set(path, data) { writes.push(data); } };
  const league = { teams: [{ code: 'T1' }, { code: 'GEN' }], settings: { scheduleSinceMs: 0 } };
  await syncSchedule({ store, paths: leaguePaths('L'), league, matches: [] });
  assert.deepEqual(writes[0].result.gameWinners, { 1: 'B' });
  events = [ev(1, 1)];
  await syncSchedule({ store, paths: leaguePaths('L'), league, matches: [{ id: 'lol_x1', esportsMatchId: 'x1', result: { status: 'live', scoreA: 0, scoreB: 1 } }] });
  assert.deepEqual(writes[1].result.gameWinners, { 2: 'A' });
});

test('winner guesses that contradict the final score are dropped', async () => {
  // Mock: GEN (team A, red side) "wins" every game by the timeline, but the real series was 2-1 to KC.
  mockLoL();
  const store = memoryStore();
  await autofillMatches({ store, paths, matches: [match({ result: { status: 'final', scoreA: 1, scoreB: 2 } })] });
  const winners = store.writes[0].data.result.games.map((g) => g.winner);
  // Game 3 is the decider → KC for sure; games 1-2 can't both be GEN, so the guesses are dropped.
  assert.deepEqual(winners, [null, null, 'B']);
});

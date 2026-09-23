// Tests the LoL Esports helpers against a simulated live-stats feed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeGame, autofillGame, eventToMatch, stageFromBlock, knockoutRound, parseWindow } from '../js/lolesports.js';

// Game started two days ago, at a time that isn't aligned to 10 seconds (like real games).
const T0 = Date.now() - 2 * 86400000 + 3456;
const END = 32 * 60; // game lasts 32:00

// Counters over time (seconds since start). Red gets first blood and tower,
// blue gets first dragon and baron, blue wins.
function teamsAt(s) {
  const n = (from, every) => (s >= from ? 1 + Math.floor((s - from) / every) : 0);
  return {
    blueTeam: {
      totalKills: n(400, 120), totalGold: 2500 + s * 40, towers: s >= 900 ? 1 + Math.floor((s - 900) / 200) : 0,
      barons: s >= 1450 ? 1 : 0, inhibitors: s >= 1800 ? 2 : 0, dragons: s >= 425 ? ['ocean'] : [],
    },
    redTeam: {
      totalKills: n(313, 100), totalGold: 2500 + s * 38, towers: s >= 764 ? 1 : 0,
      barons: 0, inhibitors: 0, dragons: s >= 800 ? ['infernal'] : [],
    },
  };
}

function frames(fromSec) {
  const out = [];
  for (let s = fromSec; s < fromSec + 10 && s <= END; s++) {
    out.push({ rfc460Timestamp: new Date(T0 + s * 1000).toISOString(), gameState: s >= END ? 'finished' : 'in_game', ...teamsAt(s) });
  }
  return out;
}

const META = { blueTeamMetadata: { esportsTeamId: 'id-kc' }, redTeamMetadata: { esportsTeamId: 'id-hle' } };

function mockFetch({ afterEnd }) {
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls++;
    const url = new URL(String(input));
    if (url.pathname.includes('/getEventDetails')) {
      return Response.json({ data: { event: { match: {
        teams: [{ id: 'id-hle', code: 'HLE' }, { id: 'id-kc', code: 'KC' }],
        games: [{ number: 1, id: 'g1', state: 'completed', teams: [{ id: 'id-kc', side: 'blue' }, { id: 'id-hle', side: 'red' }] }],
      } } } });
    }
    const st = url.searchParams.get('startingTime');
    let sec = st ? Math.round((Date.parse(st) - T0) / 1000) : 0;
    if (sec < 0) sec = 0;
    if (sec > END) {
      if (afterEnd === '204') return new Response(null, { status: 204 });
      sec = END; // "clamp" variant: keep serving the final frame
    }
    return Response.json({ esportsGameId: 'g1', gameMetadata: META, frames: frames(sec) });
  };
  return () => calls;
}

for (const afterEnd of ['204', 'clamp']) {
  test(`analyzeGame finds firsts, length and kills (feed ${afterEnd}s after the end)`, async () => {
    const calls = mockFetch({ afterEnd });
    const r = await analyzeGame('g1');
    assert.equal(r.firstBlood, 'red');
    assert.equal(r.firstDragon, 'blue');
    assert.equal(r.firstTower, 'red');
    assert.equal(r.firstBaron, 'blue');
    assert.equal(r.winnerGuess, 'blue');
    assert.ok(Math.abs(r.durationSec - END) <= 10, `duration ${r.durationSec}`);
    const end = teamsAt(END);
    assert.equal(r.totalKills, end.blueTeam.totalKills + end.redTeam.totalKills);
    assert.ok(calls() < 80, `too many requests: ${calls()}`);
  });
}

test('autofillGame maps blue/red to our team A/B', async () => {
  mockFetch({ afterEnd: '204' });
  const res = await autofillGame({ esportsMatchId: 'm1', teamA: 'HLE', teamB: 'KC', bestOf: 3 }, 1);
  // KC was on blue side, HLE on red.
  assert.equal(res.firstBlood, 'A');
  assert.equal(res.firstDragon, 'B');
  assert.equal(res.firstBaron, 'B');
  assert.equal(res.winner, 'B');
});

test('autofillGame refuses games that are not finished', async () => {
  globalThis.fetch = async () => Response.json({ data: { event: { match: { teams: [], games: [{ number: 1, id: 'g', state: 'inProgress' }] } } } });
  await assert.rejects(() => autofillGame({ esportsMatchId: 'm1', teamA: 'A', teamB: 'B' }, 1), /not completed/);
});

test('schedule events map to matches', () => {
  const m = eventToMatch({
    startTime: '2026-11-03T15:00:00Z', state: 'completed', blockName: 'Quarterfinals',
    match: { id: '123', strategy: { count: 5 }, teams: [
      { code: 'GEN', name: 'Gen.G', image: 'x.png', result: { gameWins: 3 } },
      { code: 'TBD', name: 'TBD', result: null },
    ] },
  });
  assert.equal(m.stage, 'knockout');
  assert.equal(m.round, 'QF');
  assert.equal(m.teamA.code, 'GEN');
  assert.equal(m.teamB.code, 'TBD');
  assert.equal(m.scoreA, 3);
  assert.equal(m.bestOf, 5);
  assert.equal(stageFromBlock('Play-In'), 'playin');
  assert.equal(stageFromBlock('Swiss'), 'swiss');
  assert.equal(knockoutRound('Finals'), 'F');
  assert.equal(knockoutRound('Play-In Finals'), null);
});

test('parseWindow reads the latest frame', () => {
  const w = { gameMetadata: META, frames: frames(600) };
  const p = parseWindow(w, [{ id: 'id-kc', code: 'KC' }, { id: 'id-hle', code: 'HLE' }]);
  assert.equal(p.blue.code, 'KC');
  assert.equal(p.red.code, 'HLE');
  assert.equal(p.blue.dragons.length, 1);
});

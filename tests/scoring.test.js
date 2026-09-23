import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../js/defaults.js';
import {
  lengthBucket, lengthLabels, killsResult, seriesScores, possibleTotals,
  parseDuration, formatDuration, matchStatus, scoreMatchPick, scorePredictions,
  bracketState, scoreBracket, computeStandings,
} from '../js/scoring.js';

const S = DEFAULT_SETTINGS;
const P = S.points;

const bo5 = (result, extra = {}) => ({ id: 'm1', teamA: 'HLE', teamB: 'T1', bestOf: 5, startMs: 1000, result, ...extra });

test('series helpers', () => {
  assert.deepEqual(seriesScores(5), ['3-0', '3-1', '3-2', '2-3', '1-3', '0-3']);
  assert.deepEqual(seriesScores(3), ['2-0', '2-1', '1-2', '0-2']);
  assert.deepEqual(seriesScores(1), ['1-0', '0-1']);
  assert.deepEqual(possibleTotals(5), [3, 4, 5]);
  assert.deepEqual(possibleTotals(3), [2, 3]);
});

test('duration parsing and formatting', () => {
  assert.equal(parseDuration('31:45'), 1905);
  assert.equal(parseDuration('31'), 1860);
  assert.equal(parseDuration(''), null);
  assert.equal(parseDuration('31:75'), null);
  assert.equal(parseDuration('abc'), null);
  assert.equal(formatDuration(1905), '31:45');
  assert.equal(formatDuration(null), '');
});

test('length buckets and kills line', () => {
  const b = [28, 32, 36];
  assert.equal(lengthBucket(27 * 60 + 59, b), 0);
  assert.equal(lengthBucket(28 * 60, b), 1);
  assert.equal(lengthBucket(35 * 60, b), 2);
  assert.equal(lengthBucket(40 * 60, b), 3);
  assert.equal(lengthBucket(null, b), null);
  assert.deepEqual(lengthLabels(b), ['Under 28m', '28–32m', '32–36m', '36m+']);
  assert.equal(killsResult(30, 26.5), 'over');
  assert.equal(killsResult(20, 26.5), 'under');
  assert.equal(killsResult(26, 26), 'push');
  assert.equal(killsResult(null, 26.5), null);
});

test('match status', () => {
  assert.equal(matchStatus(bo5(null, { startMs: 5000 }), 1000), 'open');
  assert.equal(matchStatus(bo5(null, { startMs: 5000, locked: true }), 1000), 'locked');
  assert.equal(matchStatus(bo5(null, { startMs: 500 }), 1000), 'locked');
  assert.equal(matchStatus(bo5({ status: 'live' }), 1000), 'live');
  assert.equal(matchStatus(bo5({ status: 'final', scoreA: 3, scoreB: 1 }), 1000), 'final');
});

test('pending match gives zero points', () => {
  const r = scoreMatchPick(bo5(null), { winner: 'A', score: '3-1', totalGames: 4 }, S);
  assert.equal(r.points, 0);
  assert.equal(r.settled, 0);
  assert.ok(r.items.every((i) => i.status === 'pending'));
});

test('series bets are scored when the match is final', () => {
  const m = bo5({ status: 'final', scoreA: 3, scoreB: 1, games: [] });
  const r = scoreMatchPick(m, { winner: 'A', score: '3-1', totalGames: 5 }, S);
  assert.equal(r.points, P.winner + P.score);
  assert.equal(r.correct, 2);
  assert.equal(r.settled, 3);
});

test('game props: won, lost, void for unplayed games and kill pushes', () => {
  const games = [
    { winner: 'A', firstBlood: 'A', firstDragon: 'B', firstTower: 'A', firstBaron: 'none', durationSec: 30 * 60, totalKills: 30 },
    { winner: 'A', firstBlood: 'B', durationSec: 40 * 60, totalKills: 26 },
    { winner: 'A' },
  ];
  const m = bo5({ status: 'final', scoreA: 3, scoreB: 0, games });
  const settings = { ...S, killsLine: 26 };
  const pick = {
    games: {
      1: { firstBlood: 'A', firstDragon: 'A', firstTower: 'A', firstBaron: 'none', length: 1, kills: 'over' },
      2: { firstBlood: 'B', length: 3, kills: 'under' },
      3: { firstDragon: 'A' }, // game 3 played but no first dragon entered yet → pending
      4: { firstBlood: 'A' }, // never played → void
    },
  };
  const r = scoreMatchPick(m, pick, settings);
  const byGame = (n, key) => r.items.find((i) => i.game === n && i.key === key);
  assert.equal(byGame(1, 'firstBlood').status, 'won');
  assert.equal(byGame(1, 'firstDragon').status, 'lost');
  assert.equal(byGame(1, 'firstBaron').status, 'won');
  assert.equal(byGame(1, 'length').status, 'won');
  assert.equal(byGame(1, 'kills').status, 'won');
  assert.equal(byGame(2, 'kills').status, 'void');
  assert.equal(byGame(2, 'length').status, 'won');
  assert.equal(byGame(3, 'firstDragon').status, 'pending');
  assert.equal(byGame(4, 'firstBlood').status, 'void');
  const expected = P.firstBlood + P.firstTower + P.firstBaron + P.length + P.kills + P.firstBlood + P.length;
  assert.equal(r.points, expected);
});

test('bo1 ignores score and total games picks', () => {
  const m = { id: 'x', teamA: 'G2', teamB: 'KC', bestOf: 1, startMs: 0, result: { status: 'final', scoreA: 0, scoreB: 1 } };
  const r = scoreMatchPick(m, { winner: 'B', score: '1-0', totalGames: 1 }, S);
  assert.equal(r.items.length, 1);
  assert.equal(r.points, P.winner);
});

test('predictions: swiss pick\'em and champion', () => {
  const pred = { champion: 'GEN', swiss30: ['GEN', 'BLG'], swiss03: ['CBL1', 'MVK'], swissAdvance: ['T1', 'G2', 'KC'] };
  const partial = scorePredictions(pred, { swiss30: ['GEN'], swiss03: [], swissAdvance: ['T1'] }, P);
  assert.equal(partial.items.find((i) => i.key === 'swiss30' && i.pick === 'BLG').status, 'pending');
  assert.equal(partial.points, P.swiss30 + P.swissAdvance);

  const done = scorePredictions(pred, {
    swiss30: ['GEN', 'HLE'], swiss03: ['CBL1', 'CBL2'], swissAdvance: ['T1', 'G2', 'AL', 'TES', 'BLG', 'TL'], swissDone: true,
    champion: 'GEN',
  }, P);
  // GEN 3-0 ✓, BLG 3-0 ✗, CBL1 0-3 ✓, MVK 0-3 ✗, T1 ✓, G2 ✓, KC ✗, champion ✓
  assert.equal(done.points, P.swiss30 + P.swiss03 + 2 * P.swissAdvance + P.champion);
  assert.equal(done.settled, 8);
});

test('champion pick is lost as soon as that team is eliminated', () => {
  const r = scorePredictions({ champion: 'T1' }, { eliminated: new Set(['T1']) }, P);
  assert.equal(r.items[0].status, 'lost');
});

test('bracket state and scoring', () => {
  const ko = (id, slot, a, b, sa, sb) => ({ id, bracketSlot: slot, teamA: a, teamB: b, bestOf: 5, result: sa == null ? null : { status: 'final', scoreA: sa, scoreB: sb } });
  const matches = [
    ko('q1', 'QF1', 'GEN', 'G2', 3, 0),
    ko('q2', 'QF2', 'T1', 'TL', 1, 3),
    ko('q3', 'QF3', 'HLE', 'KC'),
    ko('q4', 'QF4', 'BLG', 'AL'),
  ];
  const bs = bracketState(matches);
  assert.deepEqual(bs.SF1.teams, ['GEN', 'TL']);
  assert.deepEqual(bs.SF2.teams, [null, null]);
  assert.equal(bs.QF2.winner, 'TL');

  const r = scoreBracket({ picks: { QF1: 'GEN', QF2: 'T1', QF3: 'HLE', SF1: 'T1', F: 'GEN' } }, bs, P);
  const st = Object.fromEntries(r.items.map((i) => [i.slot, i.status]));
  assert.deepEqual(st, { QF1: 'won', QF2: 'lost', QF3: 'pending', SF1: 'lost', F: 'pending' });
  assert.equal(r.points, P.bracketQF);
});

test('standings rank players and share ranks on ties', () => {
  const matches = [bo5({ status: 'final', scoreA: 3, scoreB: 2, games: [] })];
  const players = [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cat' }];
  const picks = [
    { matchId: 'm1', playerId: 'a', winner: 'A', score: '3-2' },
    { matchId: 'm1', playerId: 'b', winner: 'A' },
    { matchId: 'm1', playerId: 'c', winner: 'A' },
  ];
  const rows = computeStandings({ players, matches, picks, predictions: [], brackets: [], league: {}, settings: S });
  assert.equal(rows[0].player.id, 'a');
  assert.equal(rows[0].total, P.winner + P.score);
  assert.equal(rows[1].rank, 2);
  assert.equal(rows[2].rank, 2);
  assert.equal(rows[0].series, P.winner + P.score);
});

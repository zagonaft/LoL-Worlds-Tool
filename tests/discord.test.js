// Tests what the robot posts to Discord (and that it never posts twice).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../js/defaults.js';
import { planDiscordPosts, parseYouTubeFeed, findHighlights, escapeMd } from '../scripts/discord.mjs';

const NOW = Date.parse('2026-10-24T18:00:00Z');
const MIN = 60000;
const S = DEFAULT_SETTINGS;
const players = [{ id: 'p1', name: 'Zag' }, { id: 'p2', name: 'Alex' }, { id: 'p3', name: 'Sam' }];
const base = { id: 'm1', teamA: 'T1', teamB: 'GEN', bestOf: 3, stage: 'swiss', label: 'Round 3' };

const plan = (matches, picks = [], extra = {}) => planDiscordPosts({ settings: S, matches, players, picks, now: NOW, appUrl: 'https://x.github.io/app/?league=L', ...extra });

test('reminder about an hour before, naming who still has to pick', () => {
  const m = { ...base, startMs: NOW + 50 * MIN };
  const posts = plan([m], [{ matchId: 'm1', playerId: 'p1', winner: 'A' }]);
  assert.equal(posts.length, 1);
  assert.match(posts[0].content, /⏰ \*\*T1 vs GEN\*\* starts in 50 min \(Swiss · Round 3 · Bo3\)/);
  assert.match(posts[0].content, /Still need to pick: \*\*Alex\*\*, \*\*Sam\*\*/);
  assert.match(posts[0].content, /<https:\/\/x\.github\.io\/app\/\?league=L>/);
  assert.deepEqual(posts[0].mark, { reminder: NOW });
  // Too early, or already posted: nothing.
  assert.equal(plan([{ ...m, startMs: NOW + 3 * 60 * MIN }]).length, 0);
  assert.equal(plan([{ ...m, discord: { reminder: 1 } }]).length, 0);
});

test('picks are revealed once the match locks', () => {
  const m = { ...base, startMs: NOW - 5 * MIN };
  const picks = [
    { matchId: 'm1', playerId: 'p1', winner: 'A', score: '2-1', totalGames: 3, games: { 1: { firstBlood: 'B', length: 1, kills: 'over' }, 2: { firstBlood: 'A' } } },
    { matchId: 'm1', playerId: 'p2', winner: 'B' },
  ];
  const [post] = plan([m], picks);
  assert.match(post.content, /🔒 \*\*T1 vs GEN\*\*: bets are locked/);
  assert.match(post.content, /\*\*Zag\*\*: T1 · 2–1 · 3 games\n {3}Game 1: FB GEN · 28–32m · Over 26\.5 kills \(\+ picks for 1 more game\)/);
  assert.match(post.content, /\*\*Alex\*\*: GEN/);
  assert.match(post.content, /\*\*Sam\*\*: no picks/);
  // Nobody picked: no reveal post.
  assert.equal(plan([m]).length, 0);
});

test('game results and the final are posted behind spoiler tags', () => {
  const m = {
    ...base,
    startMs: NOW - 2 * 60 * MIN,
    discord: { reminder: 1, reveal: 1 },
    result: { status: 'final', scoreA: 2, scoreB: 0, games: [
      { winner: 'A', firstBlood: 'A', firstDragon: 'B', firstTower: 'A', firstBaron: 'none', durationSec: 1872, totalKills: 30, auto: true },
      { winner: 'A', firstBlood: 'B', durationSec: 1500, totalKills: 12, auto: true },
    ] },
  };
  const picks = [{ matchId: 'm1', playerId: 'p1', winner: 'A', score: '2-0', games: { 1: { firstBlood: 'A', firstDragon: 'A' } } }];
  const posts = plan([m], picks);
  assert.equal(posts.length, 3);
  assert.equal(posts[0].content, '🎮 **T1 vs GEN**: a game just finished\n||**Game 1**: T1 won · 31:12 · First blood T1 · Drake GEN · Tower T1 · No baron · 30 kills (over)||\n||Points: Zag +1||');
  assert.deepEqual(posts[0].mark, { games: { 1: NOW } });
  assert.match(posts[1].content, /\*\*Game 2\*\*/);
  assert.doesNotMatch(posts[1].content, /Points/); // nobody bet on game 2
  assert.match(posts[2].content, /🏁 \*\*T1 vs GEN\*\* is over/);
  assert.match(posts[2].content, /\|\|\*\*T1 wins 2–0\*\*\|\|/);
  assert.match(posts[2].content, /\|\|Points this match: Zag \+6\|\|/);
  assert.match(posts[2].content, /🏆 Standings: \|\|🥇 Zag 6 · 🥈 Alex 0 · 🥈 Sam 0\|\|/);

  // Already posted → nothing new.
  const done = { ...m, discord: { ...m.discord, games: { 1: 1, 2: 1 }, final: 1 } };
  assert.equal(plan([done], picks).length, 0);

  // Spoilers off → plain text.
  const open = planDiscordPosts({ settings: { ...S, discordSpoilers: false }, matches: [m], players, picks, now: NOW });
  assert.doesNotMatch(open[2].content, /\|\|/);
});

test('old matches are never posted (no spam when the bot is first switched on)', () => {
  const m = { ...base, startMs: NOW - 3 * 86400000, result: { status: 'final', scoreA: 2, scoreB: 1, games: [{ winner: 'A', auto: true }] } };
  assert.equal(plan([m], [{ matchId: 'm1', playerId: 'p1', winner: 'A' }]).length, 0);
});

test('highlights come from the LoL Esports YouTube feed', () => {
  const xml = `<feed>
    <entry><yt:videoId>abc123</yt:videoId><title>T1 vs. GEN | Game 1 Highlights | Worlds 2026 Swiss Stage</title><published>2026-10-24T17:10:00+00:00</published></entry>
    <entry><yt:videoId>zzz</yt:videoId><title>HLE vs. BLG | Highlights</title><published>2026-10-24T17:20:00+00:00</published></entry>
    <entry><yt:videoId>old</yt:videoId><title>T1 vs GEN Highlights | Worlds 2025</title><published>2025-11-01T10:00:00+00:00</published></entry>
    <entry><yt:videoId>notes</yt:videoId><title>T1 vs GEN &amp; the road to Worlds</title><published>2026-10-24T17:30:00+00:00</published></entry>
  </feed>`;
  const videos = parseYouTubeFeed(xml);
  assert.equal(videos.length, 4);
  assert.equal(videos[3].title, 'T1 vs GEN & the road to Worlds');
  const m = { ...base, startMs: NOW - 2 * 60 * MIN, result: { status: 'final', scoreA: 2, scoreB: 0 }, discord: { reveal: 1, final: 1 } };
  assert.deepEqual(findHighlights(m, videos).map((v) => v.id), ['abc123']);
  const posts = plan([m], [], { videos });
  assert.equal(posts.length, 1);
  assert.match(posts[0].content, /📺 Highlights: \*\*T1 vs GEN\*\*/);
  assert.match(posts[0].content, /\|\|<https:\/\/www\.youtube\.com\/watch\?v=abc123>\|\|/);
  assert.deepEqual(posts[0].mark, { videos: ['abc123'] });
  assert.equal(plan([{ ...m, discord: { ...m.discord, videos: ['abc123'] } }], [], { videos }).length, 0);
});

test('player names cannot break formatting or ping people', () => {
  assert.equal(escapeMd('@everyone ||x|| *y*'), '\\@everyone \\|\\|x\\|\\| \\*y\\*');
});

// Discord posts for the results robot, sent through a channel webhook:
//   ⏰ reminder ~1 hour before a match (and who still has to pick)
//   🔒 everyone's picks when betting locks
//   🎮 each game's result + points earned
//   🏁 final score, points for the match and the leaderboard
//   📺 the official highlight video from the LoL Esports YouTube channel
// What was already posted is remembered on each match (match.discord), so
// nothing is posted twice. Scores go behind ||spoiler|| tags unless the league
// turned that off.
import { GAME_PROPS, STAGES } from '../js/defaults.js';
import { scoreMatchPick, seriesResult, matchStatus, lengthLabels, formatDuration, killsResult, computeStandings } from '../js/scoring.js';

export const LOL_ESPORTS_YOUTUBE = 'UCvqRdlKsE5Q8mf8YXbdIJLw';

const MIN = 60000;
const HOUR = 60 * MIN;
const REMINDER_BEFORE = 65 * MIN; // post the reminder when a match starts within this
const REVEAL_WINDOW = 3 * HOUR; // picks reveal: only for matches that started recently
const RESULT_WINDOW = 12 * HOUR; // game/final posts: only for matches that started recently
const HIGHLIGHT_WINDOW = 48 * HOUR;
const MEDALS = ['🥇', '🥈', '🥉'];
const SHORT = { firstBlood: 'FB', firstDragon: 'Drake', firstTower: 'Tower', firstBaron: 'Baron' };

// Keep names from breaking Discord formatting (or pinging anyone).
export const escapeMd = (text) => String(text ?? '').replace(/([\\*_~`|>#@[\]])/g, '\\$1');

const code = (match, side) => (side === 'A' ? match.teamA : side === 'B' ? match.teamB : '?');

function stageText(match) {
  return [STAGES[match.stage], match.bracketSlot || (match.label && match.label !== STAGES[match.stage] ? match.label : '')]
    .filter(Boolean).join(' · ');
}

function propText(match, key, value, settings) {
  if (key === 'firstBaron' && value === 'none') return 'no baron';
  if (key in SHORT) return code(match, value);
  if (key === 'length') return lengthLabels(settings.lengthBuckets)[value] ?? '?';
  if (key === 'kills') return `${value === 'over' ? 'Over' : 'Under'} ${settings.killsLine} kills`;
  return String(value);
}

function pickSummary(match, pick, settings) {
  const hasGames = Object.values(pick?.games || {}).some((g) => Object.values(g || {}).some((v) => v != null));
  if (!pick || (!pick.winner && !hasGames)) return 'no picks 😬';
  const parts = [];
  if (pick.winner) parts.push(code(match, pick.winner));
  if (match.bestOf > 1 && pick.score) parts.push(pick.score.replace('-', '–'));
  if (match.bestOf > 1 && pick.totalGames) parts.push(`${pick.totalGames} games`);
  let line = parts.join(' · ') || 'no winner picked';
  const g1 = pick.games?.[1] || {};
  const props = GAME_PROPS.filter((p) => g1[p.key] != null)
    .map((p) => (SHORT[p.key] ? `${SHORT[p.key]} ${propText(match, p.key, g1[p.key], settings)}` : propText(match, p.key, g1[p.key], settings)));
  if (props.length) line += `\n   ${match.bestOf > 1 ? 'Game 1: ' : ''}${props.join(' · ')}`;
  let more = 0;
  for (let n = 2; n <= match.bestOf; n++) if (Object.values(pick.games?.[n] || {}).some((v) => v != null)) more++;
  if (more) line += ` (+ picks for ${more} more game${more === 1 ? '' : 's'})`;
  return line;
}

function gameText(match, n, g, settings) {
  const parts = [];
  if (g.winner) parts.push(`${code(match, g.winner)} won`);
  if (g.durationSec != null) parts.push(formatDuration(g.durationSec));
  if (g.firstBlood) parts.push(`First blood ${code(match, g.firstBlood)}`);
  if (g.firstDragon) parts.push(`Drake ${code(match, g.firstDragon)}`);
  if (g.firstTower) parts.push(`Tower ${code(match, g.firstTower)}`);
  if (g.firstBaron) parts.push(g.firstBaron === 'none' ? 'No baron' : `Baron ${code(match, g.firstBaron)}`);
  if (g.totalKills != null) {
    const ou = killsResult(g.totalKills, settings.killsLine);
    parts.push(`${g.totalKills} kills${ou && ou !== 'push' ? ` (${ou})` : ''}`);
  }
  return `**Game ${n}**: ${parts.join(' · ') || 'finished'}`;
}

// Everything that should be posted right now. Pure: no network, easy to test.
export function planDiscordPosts({ settings, matches, players, picks, predictions = [], brackets = [], league = {}, now = Date.now(), appUrl = '', videos = [] }) {
  const spoil = settings.discordSpoilers !== false ? (t) => `||${t}||` : (t) => t;
  const nameOf = (p) => `**${escapeMd(p.name)}**`;
  const link = appUrl ? `\nPlace your bets: <${appUrl}>` : '';
  const posts = [];
  const ordered = [...matches].sort((a, b) => (a.startMs || 0) - (b.startMs || 0));

  for (const m of ordered) {
    if (!m.startMs || !m.teamA || !m.teamB || m.teamA === 'TBD' || m.teamB === 'TBD') continue;
    const posted = m.discord || {};
    const status = matchStatus(m, now);
    const title = `**${escapeMd(m.teamA)} vs ${escapeMd(m.teamB)}**`;
    const where = [stageText(m), `Bo${m.bestOf}`].filter(Boolean).join(' · ');
    const since = now - m.startMs;
    const matchPicks = new Map(players.map((p) => [p.id, picks.find((x) => x.matchId === m.id && x.playerId === p.id)]));

    // ⏰ Reminder
    if (!posted.reminder && status === 'open' && m.startMs - now <= REMINDER_BEFORE) {
      const missing = players.filter((p) => !matchPicks.get(p.id)?.winner);
      const mins = Math.max(1, Math.round((m.startMs - now) / MIN));
      posts.push({
        matchId: m.id,
        mark: { reminder: now },
        content: `⏰ ${title} starts in ${mins} min (${where})\n${
          missing.length ? `Still need to pick: ${missing.map(nameOf).join(', ')}` : 'Everyone has placed their bets ✅'}${link}`,
      });
    }

    // 🔒 Picks reveal
    if (!posted.reveal && status !== 'open' && since <= REVEAL_WINDOW) {
      const anyone = players.some((p) => matchPicks.get(p.id));
      if (anyone) {
        const lines = players.map((p) => `${nameOf(p)}: ${pickSummary(m, matchPicks.get(p.id), settings)}`);
        posts.push({ matchId: m.id, mark: { reveal: now }, content: `🔒 ${title}: bets are locked! Here's what everyone picked:\n${lines.join('\n')}` });
      }
    }

    if (since > RESULT_WINDOW && !(status === 'final' && since <= HIGHLIGHT_WINDOW)) continue;
    const games = m.result?.games || [];
    const scored = new Map(players.map((p) => [p.id, scoreMatchPick(m, matchPicks.get(p.id), settings)]));

    // 🎮 Each finished game
    if (since <= RESULT_WINDOW) {
      games.forEach((g, i) => {
        const n = i + 1;
        if (!g || !(g.auto || (g.winner && g.durationSec != null)) || posted.games?.[n]) return;
        const pts = players
          .filter((p) => matchPicks.get(p.id)?.games?.[n])
          .map((p) => `${escapeMd(p.name)} +${scored.get(p.id).items.filter((it) => it.game === n).reduce((s, it) => s + it.points, 0)}`);
        posts.push({
          matchId: m.id,
          mark: { games: { [n]: now } },
          content: `🎮 ${title}: a game just finished\n${spoil(gameText(m, n, g, settings))}${pts.length ? `\n${spoil(`Points: ${pts.join(' · ')}`)}` : ''}`,
        });
      });
    }

    // 🏁 Final score + leaderboard
    const sr = seriesResult(m);
    if (sr && !posted.final && since <= RESULT_WINDOW) {
      const [hi, lo] = sr.score.split('-').map(Number).sort((a, b) => b - a);
      const pts = players.filter((p) => matchPicks.get(p.id)).map((p) => `${escapeMd(p.name)} +${scored.get(p.id).points}`);
      const table = computeStandings({ players, matches, picks, predictions, brackets, league, settings })
        .map((r) => `${MEDALS[r.rank - 1] || `#${r.rank}`} ${escapeMd(r.player.name)} ${r.total}`).join(' · ');
      posts.push({
        matchId: m.id,
        mark: { final: now },
        content: `🏁 ${title} is over (${where})\n${spoil(`**${escapeMd(code(m, sr.winner))} wins ${hi}–${lo}**`)}${
          pts.length ? `\n${spoil(`Points this match: ${pts.join(' · ')}`)}` : ''}${table ? `\n🏆 Standings: ${spoil(table)}` : ''}`,
      });
    }

    // 📺 Highlights
    if (status === 'final' && since <= HIGHLIGHT_WINDOW) {
      const seen = new Set(posted.videos || []);
      const found = findHighlights(m, videos).filter((v) => !seen.has(v.id));
      if (found.length) {
        const urls = found.map((v) => (settings.discordSpoilers !== false ? `||<${v.url}>||` : v.url));
        posts.push({
          matchId: m.id,
          mark: { videos: [...seen, ...found.map((v) => v.id)] },
          content: `📺 Highlights: ${title}\n${found.map((v, i) => `${escapeMd(v.title)}\n${urls[i]}`).join('\n')}`,
        });
      }
    }
  }
  return posts.map((p) => ({ ...p, content: p.content.length > 1990 ? `${p.content.slice(0, 1985)}…` : p.content }));
}

// ---------- YouTube highlights (public RSS feed, no API key needed) ----------

const unescapeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

export function parseYouTubeFeed(xml) {
  const out = [];
  for (const [, entry] of String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
    if (id && title) out.push({ id, title: unescapeXml(title.trim()), published: Date.parse(published) || 0, url: `https://www.youtube.com/watch?v=${id}` });
  }
  return out;
}

export function findHighlights(match, videos) {
  const mentions = (title, teamCode) => new RegExp(`(^|[^A-Za-z0-9])${teamCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9]|$)`, 'i').test(title);
  return videos
    .filter((v) => /highlight/i.test(v.title))
    .filter((v) => v.published >= match.startMs - HOUR && v.published <= match.startMs + HIGHLIGHT_WINDOW)
    .filter((v) => mentions(v.title, match.teamA) && mentions(v.title, match.teamB))
    .sort((a, b) => a.published - b.published);
}

export async function fetchYouTubeVideos(channelIds = [LOL_ESPORTS_YOUTUBE]) {
  const all = [];
  for (const id of channelIds) {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
    if (!res.ok) throw new Error(`YouTube feed ${res.status}`);
    all.push(...parseYouTubeFeed(await res.text()));
  }
  return all;
}

// ---------- sending ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function postToDiscord(webhookUrl, content) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}wait=true`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, username: "Worlds Pick'em", allowed_mentions: { parse: [] } }),
    });
    if (res.ok) return;
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      await sleep(Math.ceil((body.retry_after || 2) * 1000));
      continue;
    }
    throw new Error(`Discord webhook error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  throw new Error('Discord kept rate-limiting us; will try again next run.');
}

export async function runDiscord({ store, paths, league, webhookUrl, appUrl, now = Date.now(), log = () => {}, fetchVideos = fetchYouTubeVideos }) {
  const [matches, players, picks, predictions, brackets] = await Promise.all([
    store.list(paths.matches()), store.list(paths.players()), store.list(paths.picks()),
    store.list(paths.predictions()), store.list(paths.brackets()),
  ]);
  players.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const needVideos = matches.some((m) => m.result?.status === 'final' && now - m.startMs <= HIGHLIGHT_WINDOW);
  let videos = [];
  if (needVideos) {
    try { videos = await fetchVideos(); } catch (err) { log(`Highlights not checked: ${err.message}`); }
  }
  const posts = planDiscordPosts({ settings: league.settings, matches, players, picks, predictions, brackets, league, now, appUrl, videos });
  for (const p of posts) {
    await postToDiscord(webhookUrl, p.content);
    await store.set(paths.match(p.matchId), { discord: p.mark }, { merge: true });
    log(`Discord: ${p.content.split('\n')[0]}`);
    await sleep(800);
  }
  return posts.length;
}

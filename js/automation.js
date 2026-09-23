// Automatic results: shared by the app (runs while anyone has it open) and the
// GitHub "results robot" (runs every 10 minutes on GitHub's servers).
//   1. Sync the schedule + series scores from LoL Esports
//   2. Fill in first blood/dragon/tower/baron, game length and kills for every
//      finished game, and save it, so nobody has to type results in.
import { syncSchedule } from './sync.js';
import { autofillGame } from './lolesports.js';

const GAME_FIELDS = ['winner', 'firstBlood', 'firstDragon', 'firstTower', 'firstBaron', 'durationSec', 'totalKills'];
const MAX_AGE_MS = 3 * 24 * 3600000; // stop retrying games older than 3 days

export function leaguePaths(leagueId) {
  const base = `leagues/${leagueId}`;
  return {
    league: () => base,
    matches: () => `${base}/matches`,
    match: (id) => `${base}/matches/${id}`,
  };
}

// Fills every finished game that hasn't been filled yet. Values someone
// already entered by hand are never overwritten.
export async function autofillMatches({ store, paths, matches, now = Date.now(), log = () => {} }) {
  let filled = 0;
  for (const m of matches) {
    const r = m.result || {};
    if (!m.esportsMatchId || (r.status !== 'live' && r.status !== 'final')) continue;
    if (now - m.startMs > MAX_AGE_MS) continue;
    const scoreA = Number(r.scoreA) || 0;
    const scoreB = Number(r.scoreB) || 0;
    const played = scoreA + scoreB; // games finished so far
    const games = [...(r.games || [])];
    let changed = false;

    for (let n = 1; n <= played; n++) {
      const g = games[n - 1] || {};
      if (g.auto || GAME_FIELDS.every((k) => g[k] != null)) continue;
      try {
        const res = await autofillGame(m, n);
        const next = { ...g };
        for (const k of GAME_FIELDS) if (next[k] == null && res[k] != null) next[k] = res[k];
        // If one team hasn't won a game yet, we know exactly who won each game.
        if (scoreA === 0) next.winner = 'B';
        else if (scoreB === 0) next.winner = 'A';
        next.auto = true;
        games[n - 1] = next;
        changed = true;
        filled++;
        log(`Filled game ${n} of ${m.teamA} vs ${m.teamB}`);
      } catch (err) {
        // Usually the data isn't ready yet; try again on the next run.
        log(`Game ${n} of ${m.teamA} vs ${m.teamB} not filled yet: ${err.message}`);
        break;
      }
    }
    if (changed) {
      for (let i = 0; i < games.length; i++) games[i] = games[i] || {};
      await store.set(paths.match(m.id), { result: { games } }, { merge: true });
    }
  }
  return filled;
}

export async function runAutomation({ store, paths, league, getMatches, log = () => {} }) {
  const sync = await syncSchedule({ store, paths, league, matches: await getMatches() });
  log(`Schedule: ${sync.found} Worlds matches (${sync.created} new, ${sync.updated} updated)`);
  const filled = await autofillMatches({ store, paths, matches: await getMatches(), log });
  return { ...sync, filled };
}

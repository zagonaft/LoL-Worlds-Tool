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
    players: () => `${base}/players`,
    picks: () => `${base}/picks`,
    predictions: () => `${base}/predictions`,
    brackets: () => `${base}/brackets`,
  };
}

// Who won game n, when we can know it for sure (the timeline only gives a guess).
export function certainWinner(result, n) {
  const a = Number(result.scoreA) || 0;
  const b = Number(result.scoreB) || 0;
  const seen = result.gameWinners?.[n];
  if (seen) return seen; // we saw the score go up right after this game
  if (a === 0) return 'B';
  if (b === 0) return 'A';
  if (result.status !== 'final') return null;
  if (n === a + b) return a > b ? 'A' : 'B'; // the deciding game goes to the series winner
  // Count the other games we're sure about; if one team has no wins left to
  // hand out, every remaining game (including this one) went to the other team.
  let knownA = 0;
  let knownB = 0;
  for (let i = 1; i <= a + b; i++) {
    if (i === n) continue;
    const w = result.gameWinners?.[i] || (i === a + b ? (a > b ? 'A' : 'B') : null);
    if (w === 'A') knownA++;
    if (w === 'B') knownB++;
  }
  if (a - knownA === 0) return 'B';
  if (b - knownB === 0) return 'A';
  return null;
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
        const sure = certainWinner(r, n);
        if (sure) next.winner = sure;
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
    // Fix auto-filled winners with what we now know for sure, and drop guesses
    // that can't add up to the final score (better no winner than a wrong one).
    for (let n = 1; n <= played; n++) {
      const g = games[n - 1];
      if (!g?.auto) continue;
      const sure = certainWinner(r, n);
      if (sure && g.winner !== sure) { games[n - 1] = { ...g, winner: sure }; changed = true; }
    }
    if (r.status === 'final') {
      const wins = (side) => games.slice(0, played).filter((g) => g?.winner === side).length;
      if (wins('A') > scoreA || wins('B') > scoreB) {
        for (let n = 1; n <= played; n++) {
          const g = games[n - 1];
          if (g?.auto && g.winner && !certainWinner(r, n)) { games[n - 1] = { ...g, winner: null }; changed = true; }
        }
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

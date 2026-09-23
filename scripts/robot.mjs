// The results robot. GitHub runs this every 10 minutes during Worlds
// (see .github/workflows/results-robot.yml). It imports the schedule and
// series scores from LoL Esports and fills in every finished game's first
// blood, dragon, tower, baron, length and kills, so nobody has to watch.
//
// Run it yourself with:  LEAGUE_ID=yourLeagueId node scripts/robot.mjs
import { FIREBASE_CONFIG } from '../js/config.js';
import { DEFAULT_SETTINGS } from '../js/defaults.js';
import { runAutomation, leaguePaths } from '../js/automation.js';
import { createRestStore } from './firestore-rest.mjs';

const leagueId = (process.env.LEAGUE_ID || '').trim();
if (!leagueId) {
  console.error('LEAGUE_ID is not set. Add it as a repository secret (see README → "Results robot").');
  process.exit(1);
}
if (!FIREBASE_CONFIG?.projectId) {
  console.error('js/config.js has no Firebase config yet.');
  process.exit(1);
}

const store = createRestStore({
  projectId: process.env.FIREBASE_PROJECT_ID || FIREBASE_CONFIG.projectId,
  apiKey: FIREBASE_CONFIG.apiKey,
  emulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
});
const paths = leaguePaths(leagueId);

const league = await store.get(paths.league());
if (!league) {
  console.error('League not found. Check that the LEAGUE_ID secret matches the ID in your invite link.');
  process.exit(1);
}
league.settings = { ...DEFAULT_SETTINGS, ...(league.settings || {}) };
if (league.settings.liveApi === false) {
  console.log('LoL Esports live data is turned off in the league settings. Nothing to do.');
  process.exit(0);
}

const result = await runAutomation({
  store,
  paths,
  league,
  getMatches: () => store.list(paths.matches()),
  log: (msg) => console.log(msg),
});
console.log(`Done: ${result.found} matches checked, ${result.created} new, ${result.updated} updated, ${result.filled} games filled in.`);

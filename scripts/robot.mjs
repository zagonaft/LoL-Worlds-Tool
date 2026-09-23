// The results robot. GitHub runs this every 10 minutes during Worlds
// (see .github/workflows/results-robot.yml). It imports the schedule and
// series scores from LoL Esports and fills in every finished game's first
// blood, dragon, tower, baron, length and kills, so nobody has to watch.
//
// Run it yourself with:  LEAGUE_ID=yourLeagueId node scripts/robot.mjs
import { FIREBASE_CONFIG } from '../js/config.js';
import { DEFAULT_SETTINGS, DEFAULT_POINTS } from '../js/defaults.js';
import { runAutomation, leaguePaths } from '../js/automation.js';
import { createRestStore } from './firestore-rest.mjs';
import { runDiscord, postToDiscord } from './discord.mjs';

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
league.settings = {
  ...DEFAULT_SETTINGS,
  ...(league.settings || {}),
  points: { ...DEFAULT_POINTS, ...(league.settings?.points || {}) },
};

// 1) Results from LoL Esports
if (league.settings.liveApi === false) {
  console.log('LoL Esports live data is turned off in the league settings; skipping results.');
} else {
  const result = await runAutomation({
    store,
    paths,
    league,
    getMatches: () => store.list(paths.matches()),
    log: (msg) => console.log(msg),
  });
  console.log(`Done: ${result.found} matches checked, ${result.created} new, ${result.updated} updated, ${result.filled} games filled in.`);
}

// 2) Discord posts (only when the DISCORD_WEBHOOK_URL secret is set)
const webhookUrl = (process.env.DISCORD_WEBHOOK_URL || '').trim();
if (webhookUrl) {
  const repo = process.env.GITHUB_REPOSITORY || '';
  const [owner, name] = repo.split('/');
  const site = (process.env.APP_URL || '').trim() || (owner && name ? `https://${owner.toLowerCase()}.github.io/${name}/` : '');
  const appUrl = site ? `${site}${site.includes('?') ? '&' : '?'}league=${leagueId}` : '';
  if (process.env.DISCORD_TEST === 'true') {
    await postToDiscord(webhookUrl, `👋 **Worlds Pick'em** is connected to this channel! During Worlds I'll post match reminders, everyone's picks, results, the leaderboard and highlights here.${appUrl ? `
The app: <${appUrl}>` : ''}`);
    console.log('Discord: test message sent.');
  }
  const sent = await runDiscord({ store, paths, league, webhookUrl, appUrl, log: (msg) => console.log(msg) });
  console.log(`Discord: ${sent} post${sent === 1 ? '' : 's'} sent.`);
} else {
  console.log('Discord: no DISCORD_WEBHOOK_URL secret set, skipping.');
}

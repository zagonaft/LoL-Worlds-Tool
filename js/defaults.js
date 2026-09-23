// Default data used when a new league is created.
// Everything here can be edited later from the Admin page.

export const TOURNAMENT_NAME = 'Worlds 2026';

// Qualified teams as of late September 2026. Slots that were still being
// decided are "TBD" placeholders; rename them in Admin → Teams once known.
export const DEFAULT_TEAMS = [
  { code: 'HLE', name: 'Hanwha Life Esports', region: 'LCK' },
  { code: 'GEN', name: 'Gen.G', region: 'LCK' },
  { code: 'T1', name: 'T1', region: 'LCK' },
  { code: 'DK', name: 'Dplus KIA', region: 'LCK' },
  { code: 'AL', name: "Anyone's Legend", region: 'LPL' },
  { code: 'BLG', name: 'Bilibili Gaming', region: 'LPL' },
  { code: 'TES', name: 'Top Esports', region: 'LPL' },
  { code: 'LPL4', name: 'LPL 4th seed (TBD)', region: 'LPL' },
  { code: 'G2', name: 'G2 Esports', region: 'LEC' },
  { code: 'KC', name: 'Karmine Corp', region: 'LEC' },
  { code: 'MKOI', name: 'Movistar KOI', region: 'LEC' },
  { code: 'TL', name: 'Team Liquid', region: 'LCS' },
  { code: 'C9', name: 'Cloud9', region: 'LCS' },
  { code: 'LCS3', name: 'LCS 3rd seed (TBD)', region: 'LCS' },
  { code: 'TSW', name: 'Team Secret Whales', region: 'LCP' },
  { code: 'CFO', name: 'CTBC Flying Oyster', region: 'LCP' },
  { code: 'MVK', name: 'MVK Esports', region: 'LCP' },
  { code: 'CBL1', name: 'CBLOL 1st seed (TBD)', region: 'CBLOL' },
  { code: 'CBL2', name: 'CBLOL 2nd seed (TBD)', region: 'CBLOL' },
];

export const REGIONS = ['LCK', 'LPL', 'LEC', 'LCS', 'LCP', 'CBLOL', 'Other'];

// Points for each correct pick.
export const DEFAULT_POINTS = {
  winner: 2,
  score: 3,
  totalGames: 1,
  firstBlood: 1,
  firstDragon: 1,
  firstTower: 1,
  firstBaron: 1,
  length: 2,
  kills: 1,
  champion: 10,
  swiss30: 3,
  swiss03: 3,
  swissAdvance: 1,
  bracketQF: 2,
  bracketSF: 4,
  bracketF: 6,
};

export const POINT_LABELS = {
  winner: 'Match winner',
  score: 'Exact series score',
  totalGames: 'Number of games',
  firstBlood: 'First blood (per game)',
  firstDragon: 'First dragon (per game)',
  firstTower: 'First tower (per game)',
  firstBaron: 'First baron (per game)',
  length: 'Game length (per game)',
  kills: 'Total kills over/under (per game)',
  champion: 'World champion',
  swiss30: 'Swiss 3-0 team (each)',
  swiss03: 'Swiss 0-3 team (each)',
  swissAdvance: 'Team advancing from Swiss (each)',
  bracketQF: 'Quarterfinal winner (bracket)',
  bracketSF: 'Semifinal winner (bracket)',
  bracketF: 'Final winner (bracket)',
};

export const DEFAULT_SETTINGS = {
  points: DEFAULT_POINTS,
  killsLine: 26.5,
  // Game length buckets in minutes: < 28, 28–32, 32–36, 36+
  lengthBuckets: [28, 32, 36],
  // Tournament predictions lock when the Swiss stage starts (Oct 23),
  // the knockout bracket when the quarterfinals start (Nov 3).
  predictionsLockMs: Date.parse('2026-10-23T17:00:00Z'),
  knockoutLockMs: Date.parse('2026-11-03T17:00:00Z'),
  // Schedule sync ignores LoL Esports matches before this date.
  scheduleSinceMs: Date.parse('2026-10-01T00:00:00Z'),
  liveApi: true,
};

// Bets offered for every game of a series.
export const GAME_PROPS = [
  { key: 'firstBlood', label: 'First blood', type: 'side' },
  { key: 'firstDragon', label: 'First dragon', type: 'side' },
  { key: 'firstTower', label: 'First tower', type: 'side' },
  { key: 'firstBaron', label: 'First baron', type: 'sideOrNone' },
  { key: 'length', label: 'Game length', type: 'length' },
  { key: 'kills', label: 'Total kills', type: 'kills' },
];

export const STAGES = {
  playin: 'Play-In',
  swiss: 'Swiss',
  knockout: 'Knockouts',
};

export const BRACKET_SLOTS = ['QF1', 'QF2', 'QF3', 'QF4', 'SF1', 'SF2', 'F'];

export const SLOT_LABELS = {
  QF1: 'Quarterfinal 1',
  QF2: 'Quarterfinal 2',
  QF3: 'Quarterfinal 3',
  QF4: 'Quarterfinal 4',
  SF1: 'Semifinal 1',
  SF2: 'Semifinal 2',
  F: 'Final',
};

export const PLAYER_COLORS = [
  '#3fa7ff', '#ff5a5f', '#ffc53d', '#35d49a',
  '#b57bff', '#ff8a3d', '#4de1e1', '#ff6fb5',
];

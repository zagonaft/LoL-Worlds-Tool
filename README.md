# LoL Worlds 2026 Pick'em

A fake-betting app for you and your friends for the **League of Legends World Championship 2026**.
Everyone gets their own login, picks update live on everyone's screen, and a live score widget
follows the match being played.

## What you can bet on

| Per match | Per game (each game of the series) | Tournament-wide |
|---|---|---|
| Match winner | First blood | World champion |
| Exact series score (3-0, 3-1, 3-2…) | First dragon | Swiss: 2 teams that go 3-0 |
| Number of games (3, 4 or 5) | First tower | Swiss: 2 teams that go 0-3 |
| | First baron (or none) | Swiss: 6 more teams that advance |
| | Game length (under 28m, 28–32m, 32–36m, 36m+) | Full knockout bracket (QF → Final) |
| | Total kills over/under | |

Each correct pick earns points (admins can change the values). Bets lock automatically when a
match starts, and nobody sees your picks until then. After that, everyone's picks are shown
side by side with ✓ / ✗.

**Screens**
- **Matches**: your personal view. It shows your rank, points and accuracy, the matches you
  still need to pick, and everyone's picks once a match locks.
- **Bracket**: tournament predictions and your knockout bracket.
- **Standings**: the leaderboard, with points split by bet type.
- **Admin**: add or sync matches, enter results (with auto-fill), and manage teams, players
  and settings.
- **Live score widget**: bottom-right corner of every page. Open `#/widget` for a full-screen
  version, handy on a second screen.

## Setup (about 15 minutes, all free)

The app is a static website (**GitHub Pages**) plus a small free database (**Firebase Firestore**)
that keeps everyone's bets in sync.

### 1. Create the Firebase database

1. Go to <https://console.firebase.google.com> and click **Create a project** (any name, e.g.
   `worlds-bets`). You can turn Google Analytics off.
2. In the left menu, open **Build → Firestore Database → Create database**. Pick a location
   close to you and start in **production mode**.
3. Open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules)
   and click **Publish**.
4. Click the ⚙️ gear → **Project settings** → *Your apps* → the **`</>`** (Web) button. Register
   the app (any nickname; you don't need Firebase Hosting). Firebase shows a `firebaseConfig = { … }` block.
5. Paste those values into [`js/config.js`](js/config.js), replacing `null`. You can edit the
   file right on GitHub with the ✏️ button.

> These config values are **not secret**: every Firebase web app has them in its page source.
> What protects your data is the rules file from step 3.

### 2. Put the site online with GitHub Pages

1. On GitHub, open the repo's **Settings → Pages**.
2. Under *Build and deployment*, choose **Deploy from a branch**, pick your branch (e.g. `main`)
   with the `/ (root)` folder, and **Save**.
3. After a minute or so the site is live at `https://zagonaft.github.io/LoL-Worlds-Tool/`.

> GitHub Pages is free for **public** repositories. A public repo is fine here: your league's
> data lives in Firebase behind a secret link, not in the code.

### 3. Create your league and invite friends

1. Open the site and click **Create league**.
2. Join as the first player (pick a name and a PIN). The first player becomes the admin.
3. Click **Invite** (top right) and send the link to your friends. Each of them joins with their own name and PIN.

## Running the tournament (admin)

- **Matches**: once Riot publishes the Worlds schedule, go to **Admin → Sync schedule from LoL
  Esports**. It imports every match, team logo and series score, and repeats automatically every
  few minutes while an admin has the app open. You can also add or edit matches by hand.
- **Results**: series scores come in automatically from the sync. Open **Result** on a match to
  confirm the per-game bets (first blood, dragon, tower, baron, length, kills). The **⚡ Auto-fill**
  button reads the game's timeline from LoL Esports and fills everything in for you to check before saving.
- **Swiss results**: in **Admin → Tournament results**, tap the teams that went 3-0, 0-3 or
  advanced. Tick *Swiss stage is finished* when it's over.
- **Knockout bracket**: knockout matches need a **bracket slot** (QF1–QF4, SF1, SF2, F). The sync
  sets these in schedule order; check that QF1 and QF2 winners actually meet in SF1, and so on.
  The bracket locks at the time set in **Settings** (default: Nov 3).
- **Teams**: a few Worlds slots were still being decided when this was built (LPL 4th seed,
  LCS 3rd seed, both CBLOL teams). Rename the TBD placeholders in **Admin → Teams** (or let the
  sync add the real teams, then delete the placeholders).

## Try it without Firebase (demo mode)

While `js/config.js` still says `null`, the app runs in **demo mode**: everything works, but data is only
saved in your own browser. In demo mode **Admin → Add sample matches** creates a few matches to play with.

To run it on your computer (needs [Node.js](https://nodejs.org)):

```bash
npm start        # serves the site at http://localhost:5173
npm test         # runs the scoring and LoL Esports tests
```

## How it's built

Plain HTML, CSS and JavaScript (ES modules). There's no build step and no framework.

| File | What it does |
|---|---|
| `index.html`, `css/styles.css` | The page and its styling |
| `js/app.js` | Starts the app, loads the league, switches between screens |
| `js/store.js` | Saves and loads data (Firebase, or the browser in demo mode) |
| `js/scoring.js` | All the points rules (no UI, fully unit-tested) |
| `js/defaults.js` | Teams, default points and settings |
| `js/lolesports.js` | Live scores, schedule and game timelines from LoL Esports |
| `js/sync.js` | Imports the Worlds schedule into your league |
| `js/views/*.js` | One file per screen, plus the live widget |
| `firestore.rules` | Database security rules |

## Good to know

- **Live data** comes from the same unofficial API that lolesports.com uses. If Riot changes it,
  the widget falls back to scores entered in the app, and results can always be entered by hand.
  Auto-fill's game length is approximate because pauses count, so double-check it.
- **PINs** only stop friends from betting as each other by accident. They are not real passwords.
- **Anyone with the invite link can join**, so only share it with your group.
- **Free tier**: Firebase's free plan allows 50,000 reads and 20,000 writes per day, far more than a
  group of friends will use.

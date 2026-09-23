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
- **Help**: how to use the app, the points for each bet and the important Worlds dates.
- **Admin**: fix results if needed, and manage matches, teams, players and settings.
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

## Running the tournament (it runs itself)

Results come in **automatically** from LoL Esports. Nobody has to watch the games or type anything in:

- **Matches**: every Worlds match, team logo and series score is imported as soon as Riot publishes it.
- **Per-game bets**: when a game ends, its first blood, first dragon, first tower, first baron,
  game length and total kills are read from the game's timeline and saved, and points update for everyone.
- **Swiss results**: 3-0, 0-3 and advancing teams are worked out from the Swiss match results.
- **Champion**: taken from the result of the Final.

This runs every few minutes while anyone has the app open, and every 10 minutes on GitHub
through the **results robot** (below), so it keeps going even when nobody's watching.

You only need the Admin page to **fix a mistake**:
- **Admin → Result** on a match edits any game. Auto-filled games are tagged *auto*.
  Game length is approximate because pauses count, and the per-game winner is a best guess.
- **Admin → Tournament results**: tap a team to correct the Swiss results.
- **Knockout bracket**: knockout matches get a bracket slot (QF1–QF4, SF1, SF2, F) in schedule
  order. If the real bracket pairs them differently (QF1 and QF2 winners should meet in SF1),
  fix the slots with **Edit** before the bracket locks (Settings; default Nov 3).
- **Teams**: the real teams for the TBD slots (LPL 4th seed, LCS 3rd seed, CBLOL) are added
  automatically on the first sync. Delete the leftover TBD placeholders in **Admin → Teams**.

### Results robot (one-time setup)

The robot is a GitHub Action ([`.github/workflows/results-robot.yml`](.github/workflows/results-robot.yml))
that runs [`scripts/robot.mjs`](scripts/robot.mjs) every 10 minutes during October and November.
It's free for public repos. To switch it on:

1. Make sure this code is on the **`main`** branch. GitHub only runs scheduled robots from the default branch.
2. In the app, go to **Admin → Settings** and copy your **league ID**.
3. On GitHub, go to **Settings → Secrets and variables → Actions → New repository secret**.
   Name it `LEAGUE_ID`, paste the ID as the value, and save.
4. To test it, open the **Actions** tab → **Results robot** → **Run workflow**. The log shows what
   it imported.

### Discord channel (optional)

The results robot can also post to a Discord channel, so everyone can follow along there:

| When | What it posts |
|---|---|
| ~1 hour before a match | ⏰ Reminder, plus who still hasn't picked, with a link to the app |
| When betting locks | 🔒 Everyone's picks, side by side |
| After each game | 🎮 Winner, length, first blood/dragon/tower/baron, kills, and who earned points |
| After the match | 🏁 Final score, points for the match and the updated leaderboard |
| When it's on YouTube | 📺 The official LoL Esports highlight video |

Scores and winners are hidden behind Discord **spoiler tags** (click to reveal), so nobody gets
spoiled scrolling the channel. Turn that off in **Admin → Settings → Edit settings**. Posts arrive
within about 10–20 minutes, because they come from the robot's regular check. To set it up:

1. In Discord, open the channel's ⚙️ **Edit Channel → Integrations → Webhooks → New Webhook**,
   give it a name and click **Copy Webhook URL**.
2. On GitHub, go to **Settings → Secrets and variables → Actions → New repository secret**.
   Name it `DISCORD_WEBHOOK_URL` and paste the URL. Keep the URL private: anyone who has it can post in the channel.
3. Test it: **Actions → Results robot → Run workflow**, tick *Also send a test message to Discord*.

The posts link to `https://<your-username>.github.io/<repo>/`. If the site lives somewhere else,
add a repository **variable** (not secret) named `APP_URL` with the site's address.

## Try it without Firebase (demo mode)

While `js/config.js` still says `null`, the app runs in **demo mode**: everything works, but data is only
saved in your own browser. In demo mode **Admin → Add sample matches** creates a few matches to play with.

To run it on your computer (needs [Node.js](https://nodejs.org)):

```bash
npm start        # serves the site at http://localhost:5173
npm test         # runs the scoring, LoL Esports, automation and Discord tests
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
| `js/automation.js` | Automatic results: sync + fill in every finished game |
| `scripts/robot.mjs` | The results robot that GitHub runs every 10 minutes |
| `scripts/discord.mjs` | What the robot posts to Discord (and when) |
| `js/views/*.js` | One file per screen (matches, bracket, standings, help, admin), plus the live widget |
| `firestore.rules` | Database security rules |

## Good to know

- **Live data** comes from the same unofficial API that lolesports.com uses. If Riot changes it,
  the widget falls back to scores entered in the app, and results can always be entered by hand
  in **Admin → Result**.
- **PINs** only stop friends from betting as each other by accident. They are not real passwords.
- **Anyone with the invite link can join**, so only share it with your group.
- **Free tier**: Firebase's free plan allows 50,000 reads and 20,000 writes per day, far more than a
  group of friends will use.

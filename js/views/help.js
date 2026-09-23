// Help: how to use the app, how points work and the important dates.
import { KEY_DATES, POINT_LABELS } from '../defaults.js';
import { esc, fmtDateTime } from '../ui.js';
import { lengthLabels } from '../scoring.js';

// End of that calendar day, in the viewer's timezone.
const endOfDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).getTime();
};

function datesTable(ctx) {
  const now = Date.now();
  const rows = KEY_DATES.map((d) => {
    const at = d.lock ? ctx.settings[d.lock] : endOfDay(d.end);
    return { ...d, when: d.lock ? fmtDateTime(at) : d.when, done: at != null && now > at };
  });
  const next = rows.find((r) => !r.done);
  return `
    <table class="dates">
      <tbody>${rows.map((r) => `
        <tr class="${r.done ? 'done' : ''} ${r === next ? 'next' : ''} ${r.key ? 'key' : ''}">
          <td class="when">${r.done ? '✓ ' : ''}${esc(r.when)}</td>
          <td>${r.key ? `<strong>${esc(r.label)}</strong>` : esc(r.label)}${r === next ? ' <span class="pill pill-open">Up next</span>' : ''}
            ${r.admin && ctx.isAdmin ? `<div class="muted small">Admin: ${esc(r.admin)}</div>` : ''}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p class="muted small">Times are in your timezone. Bets on each match lock at its scheduled start, and Discord sends a reminder about an hour before.</p>`;
}

function pointsTable(ctx) {
  const P = ctx.settings.points;
  return `<table class="rules"><tbody>${Object.entries(POINT_LABELS)
    .map(([k, label]) => `<tr><td>${esc(label)}</td><td class="num">${P[k]}</td></tr>`).join('')}</tbody></table>`;
}

export function html(ctx) {
  const s = ctx.settings;
  const lengths = lengthLabels(s.lengthBuckets).join(', ');
  return `
    <section class="card help">
      <div class="card-head"><h2>How to use the app</h2></div>

      <h3>🔑 Getting in</h3>
      <ul>
        <li>Open the invite link, tap <strong>I'm new here</strong>, and pick a name, a PIN and a color.</li>
        <li>Next time, just tap your name and enter your PIN.</li>
        <li>Tap your name at the top right to switch players.</li>
        <li>Tip: add the app to your phone's home screen (Share → <em>Add to Home Screen</em>).</li>
      </ul>

      <h3>🎯 Matches: your main screen</h3>
      <ul>
        <li>The top shows your rank, points, % correct, and how many matches still need your picks.</li>
        <li>Tap a match to open it. <strong>Series bets:</strong> winner, exact score (e.g. 3–1) and number of games.</li>
        <li><strong>Per-game bets:</strong> first blood, first dragon, first tower, first baron, game length (${esc(lengths)}) and total kills over/under ${esc(s.killsLine)}.
          In a Bo3 or Bo5, use the <strong>Game 1 / 2 / 3</strong> tabs, or <strong>Copy Game 1 picks to all games</strong>.</li>
        <li>Picks save instantly. Tap a pick again to remove it.</li>
        <li>You can change picks until the match starts. Then they lock, and everyone's picks are shown with ✓ / ✗.</li>
      </ul>

      <h3>🏆 Bracket</h3>
      <ul>
        <li><strong>Tournament predictions:</strong> your champion, 2 teams that go 3-0, 2 that go 0-3, and 6 more that make it out of Swiss.</li>
        <li><strong>Swiss stage:</strong> 16 teams; each round you play a team with the same record. 3 wins and you're through to the quarterfinals, 3 losses and you're out.</li>
        <li><strong>Knockout bracket:</strong> once the quarterfinal matchups are known, tap the winners all the way to the final.</li>
      </ul>

      <h3>📊 Standings</h3>
      <ul><li>The leaderboard, with points split by bet type.</li></ul>

      <h3>🔴 Live score and Discord</h3>
      <ul>
        <li>The bubble in the bottom-right corner shows the live match or the next one. Tap it to expand; ⤢ opens it full screen.</li>
        <li>Results fill in automatically from LoL Esports: nobody has to type them in.</li>
        <li>Discord gets reminders, everyone's picks, results and highlights. Scores are hidden until you click them.</li>
      </ul>
    </section>

    <section class="card">
      <div class="card-head"><h2>Important dates</h2></div>
      ${datesTable(ctx)}
    </section>

    <section class="card">
      <div class="card-head"><h2>Points for each correct pick</h2></div>
      <p class="muted small">Picks for games that never get played (e.g. game 5 of a 3-0) don't count, and neither does a total-kills pick that lands exactly on the line.</p>
      <div class="table-wrap">${pointsTable(ctx)}</div>
    </section>

    ${ctx.isAdmin ? `
    <section class="card help">
      <div class="card-head"><h2>For the admin</h2></div>
      <ul>
        <li>After the first real matches, check <strong>Admin → Result</strong> to confirm the auto-filled games look right (they're tagged <em>auto</em>).</li>
        <li>If Riot's schedule starts the Swiss stage or quarterfinals at a different time, change the lock times in <strong>Admin → Settings → Edit settings</strong>.</li>
        <li>Knockout matches get bracket slots in schedule order. Check that QF1 and QF2 winners really meet in SF1 (fix with <strong>Edit</strong>).</li>
      </ul>
    </section>` : ''}`;
}

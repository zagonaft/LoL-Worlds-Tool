// Standings: the leaderboard and how points are earned.
import { POINT_LABELS } from '../defaults.js';
import { esc, safeColor } from '../ui.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export function html(ctx) {
  const rows = ctx.standings;
  const P = ctx.settings.points;
  const leader = rows[0]?.total || 0;

  const table = rows.map((r) => {
    const pct = r.settled ? Math.round((r.correct / r.settled) * 100) : null;
    const behind = leader - r.total;
    return `
      <tr class="${r.player.id === ctx.me.id ? 'me' : ''}">
        <td class="rank">${r.rank <= 3 && r.total > 0 ? MEDALS[r.rank - 1] : r.rank}</td>
        <td class="who"><span class="avatar sm" style="background:${safeColor(r.player.color)}">${esc(r.player.name.slice(0, 1).toUpperCase())}</span>${esc(r.player.name)}</td>
        <td class="num total">${r.total}${behind > 0 ? `<small class="muted"> −${behind}</small>` : ''}</td>
        <td class="num hide-sm">${r.series}</td>
        <td class="num hide-sm">${r.props}</td>
        <td class="num hide-sm">${r.predictions}</td>
        <td class="num hide-sm">${r.bracket}</td>
        <td class="num">${pct == null ? '–' : `${pct}%`}<small class="muted"> ${r.correct}/${r.settled}</small></td>
      </tr>`;
  }).join('');

  const rules = Object.entries(POINT_LABELS)
    .map(([k, label]) => `<tr><td>${esc(label)}</td><td class="num">${P[k]}</td></tr>`)
    .join('');

  return `
    <section class="card">
      <div class="card-head"><h2>Leaderboard</h2></div>
      <div class="table-wrap">
        <table class="standings">
          <thead><tr>
            <th>#</th><th>Player</th><th class="num">Points</th>
            <th class="num hide-sm">Series</th><th class="num hide-sm">Game bets</th>
            <th class="num hide-sm">Predictions</th><th class="num hide-sm">Bracket</th>
            <th class="num">Correct</th>
          </tr></thead>
          <tbody>${table}</tbody>
        </table>
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h2>How points work</h2></div>
      <p class="muted small">Each correct pick earns the points below. Picks for games that never get played (e.g. game 5 of a 3-0) don't count, and neither does a total-kills pick when the kills land exactly on the line.</p>
      <div class="table-wrap"><table class="rules"><tbody>${rules}</tbody></table></div>
    </section>`;
}

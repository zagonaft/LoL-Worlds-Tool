// History: every team's record, and each series they played game by game.
import { STAGES } from '../defaults.js';
import { esc, teamLogo } from '../ui.js';
import { teamHistory, tournamentActual, formatDuration, matchStatus } from '../scoring.js';

const FIRSTS = [
  ['firstBlood', 'First blood'],
  ['firstDragon', 'Drake'],
  ['firstTower', 'Tower'],
  ['firstBaron', 'Baron'],
];

const ui = { open: new Set() };

const shortDate = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function record({ w, l }) {
  return `${w}–${l}`;
}

// Who got a "first", from this team's point of view.
function firstCell(match, side, value) {
  if (value == null) return '<span class="muted">—</span>';
  if (value === 'none') return '<span class="muted">None</span>';
  const code = value === 'A' ? match.teamA : match.teamB;
  return `<span class="${value === side ? 'h-us' : 'h-them'}">${esc(code)}</span>`;
}

function gameRow(s, { n, won, game }) {
  const result = won == null ? '<span class="muted">?</span>' : won ? '<span class="h-w">W</span>' : '<span class="h-l">L</span>';
  const kills = game.totalKills != null ? `${game.totalKills} kills` : '';
  return `
    <div class="h-game">
      <span class="h-gn">G${n}</span>${result}
      <span class="h-len">${esc(formatDuration(game.durationSec)) || '<span class="muted">—</span>'}</span>
      <span class="h-kills">${kills || '<span class="muted">—</span>'}</span>
      ${FIRSTS.map(([k, label]) => `<span class="h-first"><small>${label}</small>${firstCell(s.match, s.side, game[k])}</span>`).join('')}
    </div>`;
}

function seriesCard(ctx, s) {
  const m = s.match;
  const opp = ctx.team(s.opponent);
  const tag = s.live ? '<span class="h-tag live">LIVE</span>'
    : `<span class="h-tag ${s.won ? 'w' : 'l'}">${s.won ? 'W' : 'L'}</span>`;
  const where = [STAGES[m.stage], m.label && m.label !== STAGES[m.stage] ? m.label : null, `Bo${m.bestOf || 1}`, shortDate(m.startMs)]
    .filter(Boolean).map(esc).join(' · ');
  return `
    <div class="h-series">
      <div class="h-series-head">
        ${tag}
        <strong class="h-score">${s.scoreFor}–${s.scoreAgainst}</strong>
        <span class="h-vs">vs ${teamLogo(opp, 'sm')}<strong>${esc(opp.code)}</strong></span>
        <span class="muted small h-where">${where}</span>
      </div>
      ${s.games.map((g) => gameRow(s, g)).join('')}
    </div>`;
}

function teamCard(ctx, t) {
  const team = ctx.team(t.code);
  const open = ui.open.has(t.code);
  const status = t.champion ? '<span class="h-status champ">🏆 Champion</span>'
    : t.out ? '<span class="h-status out">Eliminated</span>'
    : '<span class="h-status alive">Still in</span>';
  const next = ctx.state.matches
    .filter((m) => (m.teamA === t.code || m.teamB === t.code) && matchStatus(m) === 'open')
    .sort((x, y) => x.startMs - y.startMs)[0];
  const nextOpp = next ? ctx.team(next.teamA === t.code ? next.teamB : next.teamA) : null;
  const body = open ? `
    <div class="h-body">
      ${[...t.list].reverse().map((s) => seriesCard(ctx, s)).join('')}
      ${next ? `<p class="muted small">Next: vs <strong>${esc(nextOpp.code)}</strong> · ${esc(STAGES[next.stage] || '')} · ${esc(shortDate(next.startMs))}</p>` : ''}
    </div>` : '';
  return `
    <div class="h-team ${t.out ? 'is-out' : ''} ${open ? 'is-open' : ''}">
      <button class="h-row" data-action="histToggle" data-code="${esc(t.code)}" aria-expanded="${open}">
        ${teamLogo(team, 'md')}
        <span class="h-name"><strong>${esc(team.code)}</strong><span class="muted small">${esc(team.name || '')}</span></span>
        ${status}
        <span class="h-rec"><strong>${record(t.series)}</strong><small class="muted">series</small></span>
        <span class="h-rec"><strong>${record(t.games)}</strong><small class="muted">games</small></span>
        <span class="h-chev">${open ? '▴' : '▾'}</span>
      </button>
      ${body}
    </div>`;
}

export function html(ctx) {
  const rows = teamHistory(ctx.state.matches, tournamentActual(ctx.league, ctx.state.matches));
  return `
    <section class="card">
      <div class="card-head">
        <div><h2>Team history</h2><p class="muted small">Every team's record so far. Tap a team to see each series game by game.</p></div>
      </div>
      ${rows.length ? `<div class="h-list">${rows.map((t) => teamCard(ctx, t)).join('')}</div>`
        : '<div class="empty"><p>No matches played yet.</p></div>'}
    </section>`;
}

export const actions = {
  histToggle(el, ctx) {
    const { code } = el.dataset;
    if (ui.open.has(code)) ui.open.delete(code); else ui.open.add(code);
    ctx.render();
  },
};
